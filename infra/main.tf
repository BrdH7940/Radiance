
resource "aws_apigatewayv2_api" "http_api" {
  api_key_selection_expression = "$request.header.x-api-key"
  body                         = null
  credentials_arn              = null
  description                  = null
  disable_execute_api_endpoint = false
  fail_on_warnings             = null
  ip_address_type              = "ipv4"
  name                         = "radiance-api-gateway"
  protocol_type                = "HTTP"
  route_key                    = null
  route_selection_expression   = "$request.method $request.path"
  tags                         = {}
  tags_all                     = {}
  target                       = null
  version                      = null
  cors_configuration {
    allow_credentials = false
    allow_headers     = ["content-type"]
    allow_methods     = ["GET", "OPTIONS", "POST", "PUT"]
    allow_origins     = ["https://<CLOUDFRONT_ID>.cloudfront.net"]
    expose_headers    = []
    max_age           = 0
  }
}

# __generated__ by Terraform
resource "aws_sqs_queue" "analysis_queue" {
  content_based_deduplication       = false
  delay_seconds                     = 0
  fifo_queue                        = false
  kms_data_key_reuse_period_seconds = 300
  kms_master_key_id                 = null
  max_message_size                  = 262144
  message_retention_seconds         = 3600
  name                              = "radiance-analysis-queue"
  policy = jsonencode({
    Id = "__default_policy_ID"
    Statement = [{
      Action = "SQS:*"
      Effect = "Allow"
      Principal = {
        AWS = "arn:aws:iam::<ACCOUNT_ID>:root"
      }
      Resource = "arn:aws:sqs:<AWS_REGION>:<ACCOUNT_ID>:radiance-analysis-queue"
      Sid      = "__owner_statement"
    }]
    Version = "2012-10-17"
  })
  receive_wait_time_seconds  = 0
  sqs_managed_sse_enabled    = true
  tags                       = {}
  tags_all                   = {}
  visibility_timeout_seconds = 330
}

# __generated__ by Terraform from "radiance-backend-image"
resource "aws_ecr_repository" "backend_repo" {
  force_delete         = null
  image_tag_mutability = "MUTABLE"
  name                 = "radiance-backend-image"
  tags = {
    Project = "RadianceAI"
  }
  tags_all = {
    Project = "RadianceAI"
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
  image_scanning_configuration {
    scan_on_push = true
  }
}

# __generated__ by Terraform from "ECOKYGSLFB5CM"
resource "aws_cloudfront_distribution" "frontend_cf" {
  aliases             = []
  comment             = null
  default_root_object = "index.html"
  enabled             = true
  http_version        = "http2"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All"
  retain_on_delete    = false
  staging             = false
  tags = {
    Name = "radiance-frontend-distribution"
  }
  tags_all = {
    Name = "radiance-frontend-distribution"
  }
  wait_for_deployment = true
  web_acl_id          = null
  custom_error_response {
    error_caching_min_ttl = 10
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }
  custom_error_response {
    error_caching_min_ttl = 10
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }
  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD"]
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    default_ttl                = 0
    field_level_encryption_id  = null
    max_ttl                    = 0
    min_ttl                    = 0
    origin_request_policy_id   = null
    realtime_log_config_arn    = null
    response_headers_policy_id = null
    smooth_streaming           = false
    target_origin_id           = "radiance-frontend-<S3_FRONTEND_NAME>.s3.<AWS_REGION>.amazonaws.com-mnbg8e5kjhp"
    trusted_key_groups         = []
    trusted_signers            = []
    viewer_protocol_policy     = "redirect-to-https"
    grpc_config {
      enabled = false
    }
  }
  origin {
    connection_attempts      = 3
    connection_timeout       = 10
    domain_name              = "radiance-frontend-<S3_FRONTEND_NAME>.s3.<AWS_REGION>.amazonaws.com"
    origin_access_control_id = "<CLOUDFRONT_ID>"
    origin_id                = "radiance-frontend-<S3_FRONTEND_NAME>.s3.<AWS_REGION>.amazonaws.com-mnbg8e5kjhp"
    origin_path              = null
  }
  restrictions {
    geo_restriction {
      locations        = []
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn            = null
    cloudfront_default_certificate = true
    iam_certificate_id             = null
    minimum_protocol_version       = "TLSv1"
    ssl_support_method             = null
  }
}

# __generated__ by Terraform from "radiance_lambda_role"
resource "aws_iam_role" "lambda_exec_role" {
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
  description           = null
  force_detach_policies = false
  max_session_duration  = 3600
  name                  = "radiance_lambda_role"
  path                  = "/"
  permissions_boundary  = null
  tags                  = {}
  tags_all              = {}
}

# __generated__ by Terraform
resource "aws_dynamodb_table" "analysis_table" {
  billing_mode                = "PAY_PER_REQUEST"
  deletion_protection_enabled = false
  hash_key                    = "UserId"
  name                        = "UserProfiles"
  range_key                   = null
  read_capacity               = 0
  restore_date_time           = null
  restore_source_name         = null
  restore_source_table_arn    = null
  restore_to_latest_time      = null
  stream_enabled              = false
  table_class                 = "STANDARD"
  tags = {
    Project = "RadianceAI"
  }
  tags_all = {
    Project = "RadianceAI"
  }
  write_capacity = 0
  attribute {
    name = "Email"
    type = "S"
  }
  attribute {
    name = "UserId"
    type = "S"
  }
  global_secondary_index {
    hash_key           = "Email"
    name               = "EmailIndex"
    non_key_attributes = []
    projection_type    = "ALL"
    range_key          = null
    read_capacity      = 0
    write_capacity     = 0
  }
  point_in_time_recovery {
    enabled                 = false
  }
  ttl {
    attribute_name = null
    enabled        = false
  }
}

# __generated__ by Terraform
resource "aws_s3_bucket" "cv_storage_bucket" {
  bucket              = "radiance-frontend-<S3_CV_ID>"
  force_destroy       = null
  object_lock_enabled = false
  tags = {
    Project = "RadianceAI"
  }
  tags_all = {
    Project = "RadianceAI"
  }
}

# __generated__ by Terraform from "radiance-frontend-<S3_FRONTEND_NAME>"
resource "aws_s3_bucket" "frontend_bucket" {
  bucket              = "radiance-frontend-<S3_FRONTEND_NAME>"
  force_destroy       = null
  object_lock_enabled = false
  tags                = {}
  tags_all            = {}
}

# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "radiance-backend-api"
resource "aws_lambda_function" "backend_api" {
  architectures                      = ["x86_64"]
  code_signing_config_arn            = null
  description                        = null
  filename                           = null
  function_name                      = "radiance-backend-api"
  handler                            = null
  image_uri                          = "<ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/radiance-backend-image:latest"
  kms_key_arn                        = null
  layers                             = []
  memory_size                        = 2048
  package_type                       = "Image"
  publish                            = null
  replace_security_groups_on_destroy = null
  replacement_security_group_ids     = null
  reserved_concurrent_executions     = -1
  role                               = "arn:aws:iam::<ACCOUNT_ID>:role/radiance_lambda_role"
  runtime                            = null
  s3_bucket                          = null
  s3_key                             = null
  s3_object_version                  = null
  skip_destroy                       = false
  tags = {
    Project = "RadianceAI"
  }
  tags_all = {
    Project = "RadianceAI"
  }
  timeout = 300
  environment {
    variables = {
      ANALYSIS_USER_ID             = ...
      AWS_S3_BUCKET                = ...
      DYNAMODB_ANALYSIS_TABLE_NAME = ...
      GEMINI_MODEL                 = "gemini-2.5-flash"
      GOOGLE_API_KEY               = ...
      SQS_QUEUE_URL                = ...
    }
  }
  ephemeral_storage {
    size = 512
  }
  logging_config {
    application_log_level = null
    log_format            = "Text"
    log_group             = "/aws/lambda/radiance-backend-api"
    system_log_level      = null
  }
  tracing_config {
    mode = "PassThrough"
  }
}
