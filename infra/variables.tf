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
  type        = string
  sensitive   = true
  default     = null
}