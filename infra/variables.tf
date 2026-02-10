variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "RadianceAI"
}

variable "langchain_api_key" {
  type      = string
  sensitive = true
  default   = null
}

# Gemini API key (stored in GitHub environment `env` as a secret)
variable "gemini_api_key" {
  description = "API key for Gemini (sensitive). Prefer injecting from CI/github environment or Secrets Manager."
  type        = string
  sensitive   = true
  default     = null
}

variable "ecr_repo_name" {
  description = "Name of the ECR repository to store Lambda images"
  type        = string
  default     = "radiance-backend-image"
}

variable "lambda_image_tag" {
  description = "Default image tag to deploy"
  type        = string
  default     = "latest"
}

variable "lambda_memory_size" {
  description = "Memory size (MB) for the backend Lambda"
  type        = number
  default     = 2048
}

variable "lambda_timeout" {
  description = "Timeout (seconds) for the backend Lambda"
  type        = number
  default     = 300
} 