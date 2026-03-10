.PHONY: help deps build run test clean docker-build docker-run docker-shell

IMAGE_NAME=mcp-shell
VERSION?=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

help: ## Show available commands
	@echo "mcp-shell development commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

deps: ## Install dependencies
	npm ci

build: ## Build TypeScript project
	npm run build

run: ## Run MCP server from built output
	npm start

test: ## Run TypeScript tests
	npm test

clean: ## Remove build artifacts
	rm -rf dist

docker-build: ## Build Docker image
	docker build -t $(IMAGE_NAME):$(VERSION) -t $(IMAGE_NAME):latest .

docker-run: ## Run Docker image
	docker run -it --rm -v /tmp/mcp-workspace:/tmp/mcp-workspace $(IMAGE_NAME):$(VERSION)

docker-shell: ## Open shell in Docker image
	docker run -it --rm -v /tmp/mcp-workspace:/tmp/mcp-workspace --entrypoint /bin/sh $(IMAGE_NAME):$(VERSION)
