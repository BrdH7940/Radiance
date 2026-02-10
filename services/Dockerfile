# Dockerfile for Lambda container images (single Dockerfile for all services)
# Build with: docker build --build-arg SERVICE=<service-name> -f services/Dockerfile services/

FROM public.ecr.aws/lambda/python:3.11

# Install common build dependencies (Amazon Linux 2 base)
RUN yum -y update \
 && yum install -y gcc git libffi-devel openssl-devel zlib-devel bzip2-devel make libjpeg-turbo-devel freetype-devel \
 && yum clean all

WORKDIR /var/task

ARG SERVICE=.

# copy shared code (if any) and the selected service into the image
COPY services/common /var/task/common
COPY services/${SERVICE} /var/task/

# copy the Lambda ASGI bootstrap (tries to locate an `app` in the service)
COPY services/app.py /var/task/app.py

# If the service provides requirements.txt, install it; otherwise install minimal runtime deps
COPY services/${SERVICE}/requirements.txt /var/task/requirements.txt
RUN if [ -f requirements.txt ]; then \
      pip3 install --no-cache-dir -r requirements.txt -t /var/task; \
    else \
      pip3 install --no-cache-dir fastapi mangum docling langgraph langchain-google-genai -t /var/task; \
    fi

# Ensure correct permissions
RUN chmod -R 755 /var/task

# AWS base image expects a handler named `handler` in the module provided as CMD
CMD ["app.handler"]
