# Troubleshooting Errors Log
# Project: Employee Management System (S3 + API Gateway + Lambda + DynamoDB)
# Location: E:\DevOps\aws\Projects\static-website-dynamodb
# Last Updated: 2026-09-07

---

## ERROR 1 — "❌ Network error. Check your connection." on form submit

### When it appeared
Clicking "Add Employee" button on the website showed network error toast.

### Root Cause 1 — API_ENDPOINT had placeholder value
`app.js` still had the default placeholder URL:
```javascript
// WRONG — placeholder not replaced
const API_ENDPOINT = "https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/employees";
```

**Fix:** Replace `YOUR_API_ID` with your actual API Gateway ID in `app.js`:
```javascript
// CORRECT
const API_ENDPOINT = "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees";
```
Then re-upload `app.js` to S3 and hard refresh browser (`Ctrl + Shift + R`).

---

### Root Cause 2 — API_ENDPOINT missing `/employees` path
`app.js` had the base URL but was missing the resource path:
```javascript
// WRONG — missing /employees at the end
const API_ENDPOINT = "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod";
```

**Fix:** Add `/employees` to the end:
```javascript
// CORRECT
const API_ENDPOINT = "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees";
```

**How to re-upload after fix:**
```bash
aws s3 cp E:\DevOps\aws\Projects\static-website-dynamodb\website\app.js s3://employee-mgmt-demo/app.js
```
Then do a hard refresh: `Ctrl + Shift + R`

---

## ERROR 2 — Lambda returns `{"error": "Method '' not allowed"}`

### When it appeared
API Gateway was reachable (HTTP 200) but Lambda returned 405 with empty method.

### Root Cause
API Gateway was configured with **standard Lambda integration** instead of
**Lambda Proxy integration**. Without proxy, `httpMethod`, `body`, and `headers`
are NOT forwarded to Lambda automatically — `event["httpMethod"]` was empty string.

### Fix — Enable Lambda Proxy Integration in API Gateway
1. Go to **API Gateway → EmployeeAPI → Resources → /employees**
2. Click **POST** → **Integration Request**
3. Check ✅ **"Use Lambda Proxy integration"**
4. Repeat for **GET** method
5. **Actions → Deploy API → prod** (must redeploy!)

### Code Fix Applied in lambda_function.py
Added fallback to check multiple event fields for httpMethod:
```python
http_method = (
    event.get("httpMethod")
    or event.get("requestContext", {}).get("httpMethod")
    or event.get("requestContext", {}).get("http", {}).get("method")
    or ""
).upper()
```

---

## ERROR 3 — CORS Error in Browser (blocked by browser, not visible in Postman)

### Symptoms
- Works fine in Postman or PowerShell
- Browser console shows: `Access to fetch blocked by CORS policy`
- Network tab shows OPTIONS request failing or missing headers

### Root Cause
CORS not enabled on API Gateway resource, or API was not redeployed after enabling CORS.

### Fix
1. Go to **API Gateway → /employees**
2. **Actions → Enable CORS**
3. Allow methods: `GET, POST, OPTIONS`
4. Allow headers: `Content-Type`
5. Allow origin: `*`
6. Click **Enable CORS and replace existing**
7. **MUST redeploy: Actions → Deploy API → prod**

### Verify CORS headers are present
```bash
# Run in PowerShell
Invoke-WebRequest `
  -Uri "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees" `
  -Method OPTIONS `
  -Headers @{"Origin"="http://employee-mgmt-demo.s3-website.ap-south-1.amazonaws.com"} `
  -UseBasicParsing | Select-Object -ExpandProperty Headers
```
Expected headers in response:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

---

## ERROR 4 — 403 Forbidden on S3 Website

### Symptoms
Opening the S3 website URL shows `403 Forbidden` or `Access Denied`.

### Root Cause
Either Block Public Access is still ON, or bucket policy is missing/wrong.

### Fix — Step 1: Disable Block Public Access
```bash
aws s3api put-public-access-block `
  --bucket employee-mgmt-demo `
  --public-access-block-configuration `
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### Fix — Step 2: Apply Bucket Policy
Create `bucket-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::employee-mgmt-demo/*"
    }
  ]
}
```
Apply it:
```bash
aws s3api put-bucket-policy --bucket employee-mgmt-demo --policy file://bucket-policy.json
```

---

## ERROR 5 — Lambda: "AccessDeniedException" / DynamoDB Permission Denied

### Symptoms
Lambda CloudWatch log shows:
```
botocore.exceptions.ClientError: An error occurred (AccessDeniedException)
when calling the PutItem operation: User is not authorized to perform: dynamodb:PutItem
```

### Root Cause
Lambda IAM execution role is missing DynamoDB permissions.

### Fix — Add inline policy to Lambda IAM role
1. Go to **IAM → Roles → LambdaEmployeeRole**
2. **Add permissions → Create inline policy**
3. Use this JSON:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:YOUR_ACCOUNT_ID:table/Employees"
    }
  ]
}
```
4. Replace `YOUR_ACCOUNT_ID` with your 12-digit AWS account ID
5. Save policy

---

## ERROR 6 — Lambda: "ResourceNotFoundException" Table not found

### Symptoms
CloudWatch log shows:
```
botocore.exceptions.ClientError: An error occurred (ResourceNotFoundException)
when calling the PutItem operation: Requested resource not found
```

### Root Cause
- DynamoDB table name in code doesn't match actual table name (case-sensitive)
- Table created in wrong AWS region

### Fix
Check `lambda_function.py`:
```python
DYNAMODB_TABLE = "Employees"   # must exactly match DynamoDB table name
REGION         = "ap-south-1"  # must match the region where table was created
```

Verify table exists:
```bash
aws dynamodb describe-table --table-name Employees --region ap-south-1
```

---

## ERROR 7 — API Gateway 502 Bad Gateway

### Symptoms
API returns HTTP 502 with body: `{"message": "Internal server error"}`

### Root Cause
Lambda function crashed or timed out before returning a response.

### Fix
1. Go to **CloudWatch → Log groups → /aws/lambda/EmployeeHandler**
2. Open the latest log stream and find the error message
3. Common causes:
   - Syntax error in Lambda code after editing
   - Lambda timeout too short (default 3s — increase to 10s)
   - Missing boto3 (not an issue in AWS Lambda runtime, boto3 is pre-installed)

### Increase Lambda timeout
```bash
aws lambda update-function-configuration `
  --function-name EmployeeHandler `
  --timeout 10 `
  --region ap-south-1
```

---

## ERROR 8 — Old code still running after uploading new app.js to S3

### Symptoms
Changes to `app.js` or `index.html` not reflected in browser even after re-uploading.

### Root Cause
Browser has cached the old file.

### Fix
Hard refresh the browser: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)

Or open in Incognito/Private window to bypass cache completely.

---

## ERROR 9 — Employee table shows empty after adding employee

### Symptoms
Form submits successfully (green toast appears) but table stays empty.

### Root Cause
GET fetch is not triggered after successful POST, OR the GET response
`employees` field is being read incorrectly.

### Fix — Verify GET response format
Test GET in PowerShell:
```bash
Invoke-WebRequest `
  -Uri "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees" `
  -Method GET -UseBasicParsing | Select-Object -ExpandProperty Content
```
Expected format:
```json
{
  "employees": [ { "empId": "EMP001", "name": "...", ... } ],
  "count": 1
}
```
If format is different, update `app.js` line:
```javascript
const employees = data.employees || [];
```

---

## Quick Diagnostic Commands (PowerShell)

```powershell
# Test GET (fetch all employees)
Invoke-WebRequest -Uri "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees" -Method GET -UseBasicParsing | Select-Object StatusCode, Content

# Test POST (add employee)
$body = '{"empId":"TEST01","name":"Test User","email":"test@test.com","department":"IT","role":"Engineer"}'
Invoke-WebRequest -Uri "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing | Select-Object StatusCode, Content

# Check DynamoDB table exists
aws dynamodb describe-table --table-name Employees --region ap-south-1

# Scan all records in DynamoDB
aws dynamodb scan --table-name Employees --region ap-south-1

# View Lambda logs (last 5 minutes)
aws logs tail /aws/lambda/EmployeeHandler --since 5m --region ap-south-1
```

---

## Error Summary Table

| # | Error | Cause | Fix |
|---|-------|-------|-----|
| 1a | Network error on submit | Placeholder URL in app.js | Replace YOUR_API_ID with real ID |
| 1b | Network error on submit | Missing /employees in URL | Add /employees to API_ENDPOINT |
| 2 | Method '' not allowed | Proxy integration OFF | Enable Lambda Proxy in API Gateway |
| 3 | CORS blocked by browser | CORS not enabled/deployed | Enable CORS + redeploy API |
| 4 | 403 on S3 website | Public access blocked | Disable block public access + add bucket policy |
| 5 | AccessDeniedException | IAM role missing DynamoDB perms | Add PutItem + Scan policy to role |
| 6 | ResourceNotFoundException | Wrong table name or region | Match table name and region in Lambda |
| 7 | 502 Bad Gateway | Lambda crash/timeout | Check CloudWatch logs, increase timeout |
| 8 | Old code still running | Browser cache | Ctrl+Shift+R hard refresh |
| 9 | Table empty after submit | GET not called or wrong field | Check fetchEmployees() call and data.employees |
