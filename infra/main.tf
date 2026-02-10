terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  backend "s3" {
    bucket         = "radiance-s3"
    key            = "state/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform_locks"
  }
}

provider "aws" {
  region = var.aws_region
}

# =============================================================================
# 1. DATABASE LAYER (DYNAMODB)
# =============================================================================

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform_locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name    = "Terraform State Lock Table"
    Project = var.project_name
  }
}

# Bảng chứa dữ liệu User
resource "aws_dynamodb_table" "user_data" {
  name         = "UserProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }

  attribute {
    name = "Email"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "Email"
    projection_type = "ALL"
  }

  tags = {
    Project = var.project_name
  }
}

# =============================================================================
# 2. BACKEND LAYER (LAMBDA)
# =============================================================================

# IAM
resource "aws_iam_role" "lambda_exec_role" {
  name = "radiance_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# Gán quyền ghi Log và truy cập DynamoDB cho Lambda
resource "aws_iam_role_policy" "lambda_policy" {
  name = "radiance_lambda_policy"
  role = aws_iam_role.lambda_exec_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = aws_dynamodb_table.user_data.arn
      }
    ]
  })
}

# ECR repository to store Lambda container images
resource "aws_ecr_repository" "backend" {
  name                 = var.ecr_repo_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project = var.project_name
  }
}


# Lambda Function chính
resource "aws_lambda_function" "backend_api" {
  function_name = "radiance-backend-api"
  package_type  = "Image"
  role          = aws_iam_role.lambda_exec_role.arn

  # Image URI will be populated from the ECR repository created above.
  image_uri = "${aws_ecr_repository.backend.repository_url}:${var.lambda_image_tag}"

  # Only set sensitive environment variables when the corresponding Terraform
  # variable is provided. In your case you keep the secrets in GitHub
  # environment `env` — CI should inject them at deploy time (preferred).
  environment {
    variables = merge(
      { DYNAMODB_TABLE = aws_dynamodb_table.user_data.name },
      var.langchain_api_key != null ? { LANGCHAIN_API_KEY = var.langchain_api_key } : {},
      var.gemini_api_key    != null ? { GEMINI_API_KEY    = var.gemini_api_key }    : {}
    )
  }

  # AI workloads need more resources
  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  # If you need to override the entrypoint/handler exposed by the image,
  # configure `image_config` here. By default the image should expose
  # a handler named `handler` (see `services/app.py`).
  image_config {
    command = []
  }

  tags = {
    Project = var.project_name
  }
}

# Tạo Function URL (Để Frontend gọi được Lambda mà chưa cần API Gateway phức tạp)
resource "aws_lambda_function_url" "backend_url" {
  function_name      = aws_lambda_function.backend_api.function_name
  authorization_type = "NONE" # Public access cho Sprint 0, sau này sẽ auth sau

  cors {
    allow_credentials = true
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["date", "keep-alive"]
    expose_headers    = ["keep-alive", "date"]
    max_age           = 86400
  }
}


# =============================================================================
# 3. FRONTEND LAYER (S3 STATIC WEBSITE)
# =============================================================================

# Tạo Bucket tên ngẫu nhiên (để tránh trùng lặp global)
resource "aws_s3_bucket" "frontend_bucket" {
  bucket_prefix = "radiance-frontend-"
  force_destroy = true # Cho phép xóa bucket kể cả khi có file (cẩn thận khi dùng Prod thật)

  tags = {
    Project = var.project_name
  }
}

# Cấu hình Web Hosting
resource "aws_s3_bucket_website_configuration" "frontend_config" {
  bucket = aws_s3_bucket.frontend_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "404.html"
  }
}

# Mở khóa Public Access
resource "aws_s3_bucket_public_access_block" "frontend_public" {
  bucket = aws_s3_bucket.frontend_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Policy cho phép ai cũng đọc được file (để hiển thị web)
resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket     = aws_s3_bucket.frontend_bucket.id
  depends_on = [aws_s3_bucket_public_access_block.frontend_public]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "backend_policy" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus     = "any"
        countType     = "imageCountMoreThan"
        countNumber   = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# =============================================================================
# 4. OUTPUTS (Thông tin cần thiết để config CI/CD)
# =============================================================================

output "s3_frontend_bucket_name" {
  value       = aws_s3_bucket.frontend_bucket.bucket
  description = "Tên bucket S3 dùng để deploy Frontend"
}

output "s3_website_url" {
  value       = aws_s3_bucket_website_configuration.frontend_config.website_endpoint
  description = "Link truy cập Website Frontend"
}

output "lambda_function_name" {
  value       = aws_lambda_function.backend_api.function_name
  description = "Tên Lambda Function dùng để deploy Backend"
}

output "api_endpoint_url" {
  value       = aws_lambda_function_url.backend_url.function_url
  description = "API Endpoint để Frontend gọi vào Backend"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.backend.repository_url
  description = "ECR repository URL for backend container images"
}

output "ecr_repository_arn" {
  value       = aws_ecr_repository.backend.arn
  description = "ECR repository ARN"
} 