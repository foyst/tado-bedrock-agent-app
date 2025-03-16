data "aws_bedrock_foundation_model" "foundation_model" {
  # model_id = "anthropic.claude-3-haiku-20240307-v1:0"
  model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"
}

# Agent resource role
resource "aws_iam_role" "bedrock_agent_tado_heating" {
  name = "AmazonBedrockExecutionRoleForAgents_TadoHeatingAgent"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "bedrock.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:${local.partition}:bedrock:${local.region}:${local.account_id}:agent/*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "bedrock_agent_model_policy" {
  name = "AmazonBedrockAgentBedrockFoundationModelPolicy_TadoHeatingAgent"
  role = aws_iam_role.bedrock_agent_tado_heating.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "bedrock:InvokeModel"
        Effect   = "Allow"
        Resource = "arn:${local.partition}:bedrock:${local.region}::foundation-model/${data.aws_bedrock_foundation_model.foundation_model.model_id}"
      },
    ]
  })
}

resource "aws_bedrockagent_agent" "home_heating_agent" {
  agent_name              = "Home-Heating-Agent"
  agent_resource_role_arn = aws_iam_role.bedrock_agent_tado_heating.arn
  description             = "An agent capable of controlling a Tado home heating system"
  foundation_model        = data.aws_bedrock_foundation_model.foundation_model.model_id
  instruction             = "You are a home heating assistant, capable of controlling the heating in a home. The user will make requests for you to alter the heating. You should identify what parameters you need to fulfil a request, and what function calls you need to make. You may need to chain multiple function calls together within a single request to get all the data needed to fulfil the request. Make sure any requests you make have well formed json payloads."
}

resource "aws_bedrockagent_agent_action_group" "home_heating_agent_action_group" {
  action_group_name          = "tado-heating-functions"
  agent_id                   = aws_bedrockagent_agent.home_heating_agent.id
  agent_version              = "DRAFT"
  description                = "This provides capabilities relating to controlling home heating"
  skip_resource_in_use_check = true
  action_group_executor {
    custom_control = "RETURN_CONTROL"
  }
  api_schema {
    payload = file("../tado-openapi-spec-minimal.yml")
  }
}