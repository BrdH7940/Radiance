terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Cấu hình lưu State trên S3
  backend "s3" {
    bucket         = "radiance-s3"           # Tên bucket bạn đã tạo
    key            = "state/terraform.tfstate"
    region         = "us-east-1"             # Thay bằng region bạn đang dùng
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# Thử nghiệm tạo một DynamoDB cho User Data (thuộc Free Tier)
resource "aws_dynamodb_table" "user_data" {
  name           = "UserProfiles"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }

  tags = {
    Environment = "dev"
    Project     = "RadianceAI"
  }
}