# AWS Setup Guide — Employee Management System

## Architecture
```
Browser → S3 (static site) → API Gateway → Lambda → DynamoDB
                                 POST /employees  → Insert employee
                                 GET  /employees  → Fetch all employees
```

---

## Project File Structure
```
static-website-dynamodb/
├── website/
│   ├── index.html         ← Employee form + display table
│   ├── style.css          ← Professional UI styling
│   └── app.js             ← POST (add) + GET (fetch) API calls
├── lambda/
│   └── lambda_function.py ← Lambda handler (POST + GET routes)
└── setup.md               ← This guide
```

---

## Step 1 — Create DynamoDB Table

**Console:**
1. Go to **DynamoDB → Create table**
2. Table name: `Employees`
3. Partition key: `empId` (String)
4. Sort key: `timestamp` (String)
5. Capacity mode: On-demand
6. Click **Create table**

**CLI:**
```bash
aws dynamodb create-table \
  --table-name Employees \
  --attribute-definitions \
      AttributeName=empId,AttributeType=S \
      AttributeName=timestamp,AttributeType=S \
  --key-schema \
      AttributeName=empId,KeyType=HASH \
      AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

---

## Step 2 — Create IAM Role for Lambda

1. Go to **IAM → Roles → Create role**
2. Trusted entity: **AWS Service → Lambda**
3. Attach: `AWSLambdaBasicExecutionRole`
4. Add inline policy for DynamoDB:

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

5. Role name: `LambdaEmployeeRole`

> Replace `YOUR_ACCOUNT_ID` with your 12-digit AWS account ID.

---

## Step 3 — Create Lambda Function

**Console:**
1. Go to **Lambda → Create function**
2. Function name: `EmployeeHandler`
3. Runtime: `Python 3.12`
4. Execution role: `LambdaEmployeeRole`
5. Paste contents of `lambda/lambda_function.py` in the code editor
6. Click **Deploy**

**CLI (zip & deploy):**
```bash
cd lambda
zip function.zip lambda_function.py

aws lambda create-function \
  --function-name EmployeeHandler \
  --runtime python3.12 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/LambdaEmployeeRole \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://function.zip \
  --region ap-south-1
```

---

## Step 4 — Create API Gateway

1. Go to **API Gateway → Create API → REST API → Build**
2. API name: `EmployeeAPI`
3. Click **Create API**

### Create Resource:
4. **Actions → Create Resource**
   - Resource name: `employees`
   - Resource path: `/employees`
   - ✅ Enable API Gateway CORS

### Create Methods:

**POST method:**
5. Select `/employees` → **Actions → Create Method → POST**
6. Integration: Lambda Function → `EmployeeHandler`
7. Save → Allow permission

**GET method:**
8. Select `/employees` → **Actions → Create Method → GET**
9. Integration: Lambda Function → `EmployeeHandler`
10. Save → Allow permission

### Enable CORS:
11. Select `/employees` → **Actions → Enable CORS**
12. Methods: GET, POST, OPTIONS — Click **Enable CORS and replace existing**

### Deploy:
13. **Actions → Deploy API**
    - Stage: `[New Stage]` → Name: `prod`
14. Copy the **Invoke URL**, e.g.:
    ```
    https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod
    ```

---

## Step 5 — Update app.js with Your API URL

Open `website/app.js`, find line 8 and update:
```javascript
// Replace this:
const API_ENDPOINT = "https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/employees";

// With your actual URL:
const API_ENDPOINT = "https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod/employees";
```

---

## Step 6 — Create S3 Bucket and Host Website

### Create bucket:
```bash
aws s3api create-bucket \
  --bucket employee-mgmt-demo \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

### Disable block public access:
```bash
aws s3api put-public-access-block \
  --bucket employee-mgmt-demo \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### Apply public read policy — create `bucket-policy.json`:
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
```bash
aws s3api put-bucket-policy \
  --bucket employee-mgmt-demo \
  --policy file://bucket-policy.json
```

### Enable static website hosting:
```bash
aws s3 website s3://employee-mgmt-demo/ \
  --index-document index.html \
  --error-document index.html
```

### Upload website files:
```bash
aws s3 cp website/index.html  s3://employee-mgmt-demo/
aws s3 cp website/style.css   s3://employee-mgmt-demo/
aws s3 cp website/app.js      s3://employee-mgmt-demo/
```

---

## Step 7 — Open the Website

```
http://employee-mgmt-demo.s3-website.ap-south-1.amazonaws.com
```

- Fill in employee details and click **Add Employee** → data saved to DynamoDB
- Table below auto-loads all employees on page open
- Click **Refresh** to reload the table anytime

---

## Step 8 — Verify Data in DynamoDB

**Console:** DynamoDB → Tables → Employees → Explore table items

**CLI:**
```bash
aws dynamodb scan \
  --table-name Employees \
  --region ap-south-1
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/employees` | Add a new employee |
| GET | `/employees` | Fetch all employees |

**POST Body (JSON):**
```json
{
  "empId":      "EMP001",
  "name":       "Rahul Sharma",
  "email":      "rahul@company.com",
  "phone":      "+91 9876543210",
  "department": "Engineering",
  "role":       "Software Engineer",
  "salary":     "75000",
  "joinDate":   "2026-01-15"
}
```

**GET Response:**
```json
{
  "employees": [ { ...employee objects... } ],
  "count": 5
}
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| CORS error in browser | Re-enable CORS on API Gateway → redeploy |
| 403 on S3 website | Check bucket policy + unblock public access |
| Lambda 500 error | Check CloudWatch logs for the error |
| DynamoDB permission denied | Add `dynamodb:PutItem` and `dynamodb:Scan` to IAM role |
| Table not found | Confirm table name is exactly `Employees` (case-sensitive) |
