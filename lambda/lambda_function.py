"""
lambda_function.py — Employee Management System
------------------------------------------------
Handles two HTTP methods from API Gateway:

  POST /employees → Insert a new employee into DynamoDB
  GET  /employees → Fetch all employees from DynamoDB

DynamoDB Table:  Employees
Partition Key:   empId  (String)
Sort Key:        timestamp (String)

IAM Role needs:
  - dynamodb:PutItem
  - dynamodb:Scan
"""

import json
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

# ---- Configuration ----
DYNAMODB_TABLE = "Employees"
REGION         = "ap-south-1"   # Change to your region

# ---- AWS Client ----
dynamodb = boto3.resource("dynamodb", region_name=REGION)
table    = dynamodb.Table(DYNAMODB_TABLE)

# ---- Logger ----
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ---- CORS Headers ----
CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type":                 "application/json",
}


# ============================================
# Main Handler
# ============================================
def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    # Support both Lambda Proxy and non-proxy API Gateway integrations
    http_method = (
        event.get("httpMethod")                                      # Lambda Proxy integration
        or event.get("requestContext", {}).get("httpMethod")         # REST API with requestContext
        or event.get("requestContext", {}).get("http", {}).get("method")  # HTTP API (payload v2)
        or ""
    ).upper()

    logger.info("Resolved httpMethod: '%s'", http_method)

    # CORS preflight
    if http_method == "OPTIONS":
        return build_response(200, {"message": "CORS OK"})

    # Route to correct handler
    if http_method == "POST":
        return handle_post(event)

    if http_method == "GET":
        return handle_get()

    # If method is still empty, default to GET (safe read-only fallback for testing)
    if http_method == "":
        logger.warning("httpMethod is empty — defaulting to GET for diagnostics")
        return handle_get()

    return build_response(405, {"error": f"Method '{http_method}' not allowed"})


# ============================================
# POST — Insert New Employee
# ============================================
def handle_post(event):
    """Parse body, validate, and insert employee into DynamoDB."""

    # Parse JSON body
    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON: %s", str(e))
        return build_response(400, {"error": "Invalid JSON in request body"})

    # Validate required fields
    required = ["empId", "name", "email", "department", "role"]
    missing  = [f for f in required if not body.get(f, "").strip()]
    if missing:
        logger.warning("Missing fields: %s", missing)
        return build_response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

    # Build DynamoDB item
    item = {
        "empId":      body["empId"].strip().upper(),
        "timestamp":  datetime.now(timezone.utc).isoformat(),    # Sort Key
        "name":       body["name"].strip(),
        "email":      body["email"].strip().lower(),
        "phone":      body.get("phone", "").strip(),
        "department": body["department"].strip(),
        "role":       body["role"].strip(),
        "salary":     body.get("salary", "").strip(),
        "joinDate":   body.get("joinDate", "").strip(),
    }

    logger.info("Inserting employee: empId=%s, name=%s", item["empId"], item["name"])

    try:
        table.put_item(Item=item)
        logger.info("Successfully inserted empId=%s", item["empId"])
    except ClientError as e:
        logger.error("DynamoDB PutItem error: %s", str(e))
        return build_response(500, {"error": "Failed to save employee data."})

    return build_response(200, {
        "message": f"Employee '{item['name']}' added successfully!",
        "empId":   item["empId"],
    })


# ============================================
# GET — Fetch All Employees
# ============================================
def handle_get():
    """Scan DynamoDB table and return all employees."""

    logger.info("Fetching all employees from table: %s", DYNAMODB_TABLE)

    try:
        # Scan returns all items (suitable for small-to-medium datasets)
        response   = table.scan()
        employees  = response.get("Items", [])

        # Handle DynamoDB pagination (if table has many records)
        while "LastEvaluatedKey" in response:
            response  = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            employees += response.get("Items", [])

        logger.info("Fetched %d employees", len(employees))

    except ClientError as e:
        logger.error("DynamoDB Scan error: %s", str(e))
        return build_response(500, {"error": "Failed to fetch employee data."})

    return build_response(200, {
        "employees": employees,
        "count":     len(employees),
    })


# ============================================
# Helper — Build API Gateway Response
# ============================================
def build_response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers":    CORS_HEADERS,
        "body":       json.dumps(body_dict, default=str),
    }
