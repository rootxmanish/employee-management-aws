// =============================================
// app.js — Employee Management System
// POST → Add new employee to DynamoDB
// GET  → Fetch all employees from DynamoDB
// =============================================

// TODO: Replace with your actual API Gateway URL after deploying
const API_ENDPOINT = "https://sck8cg1lq3.execute-api.ap-south-1.amazonaws.com/prod/employees";

// =============================================
// DOM References
// =============================================
const form          = document.getElementById("employeeForm");
const submitBtn     = document.getElementById("submitBtn");
const btnText       = document.getElementById("btn-text");
const btnLoading    = document.getElementById("btn-loading");
const msgSuccess    = document.getElementById("msg-success");
const msgError      = document.getElementById("msg-error");
const tableBody     = document.getElementById("employeeTableBody");
const tableLoading  = document.getElementById("tableLoading");
const noData        = document.getElementById("noData");
const totalCount    = document.getElementById("totalCount");
const deptCount     = document.getElementById("deptCount");

// =============================================
// Helpers
// =============================================

function showToast(type, text) {
  msgSuccess.style.display = "none";
  msgError.style.display   = "none";

  if (type === "success") {
    if (text) msgSuccess.textContent = "✅ " + text;
    msgSuccess.style.display = "block";
  } else {
    if (text) msgError.textContent = "❌ " + text;
    msgError.style.display = "block";
  }

  setTimeout(() => {
    msgSuccess.style.display = "none";
    msgError.style.display   = "none";
  }, 5000);
}

function setSubmitLoading(isLoading) {
  submitBtn.disabled        = isLoading;
  btnText.style.display     = isLoading ? "none"   : "inline";
  btnLoading.style.display  = isLoading ? "inline" : "none";
}

function formatCurrency(value) {
  if (!value) return "—";
  return "₹" + Number(value).toLocaleString("en-IN");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getDeptClass(dept) {
  return "dept-badge dept-" + (dept || "IT").replace(/\s+/g, "");
}

// =============================================
// POST — Add New Employee
// =============================================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    empId:      document.getElementById("empId").value.trim(),
    name:       document.getElementById("name").value.trim(),
    email:      document.getElementById("email").value.trim().toLowerCase(),
    phone:      document.getElementById("phone").value.trim(),
    department: document.getElementById("department").value,
    role:       document.getElementById("role").value.trim(),
    salary:     document.getElementById("salary").value.trim(),
    joinDate:   document.getElementById("joinDate").value,
  };

  // Client-side validation
  if (!payload.empId || !payload.name || !payload.email || !payload.department || !payload.role) {
    showToast("error", "Please fill all required fields.");
    return;
  }

  setSubmitLoading(true);

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      showToast("success", `Employee "${payload.name}" added successfully!`);
      form.reset();
      fetchEmployees(); // refresh table immediately
    } else {
      showToast("error", data.error || "Server error. Please try again.");
    }
  } catch (err) {
    console.error("POST error:", err);
    showToast("error", "Network error. Check your connection.");
  } finally {
    setSubmitLoading(false);
  }
});

// =============================================
// GET — Fetch All Employees
// =============================================
async function fetchEmployees() {
  tableLoading.style.display = "block";
  noData.style.display       = "none";
  tableBody.innerHTML        = "";

  try {
    const res  = await fetch(API_ENDPOINT, { method: "GET" });
    const data = await res.json();

    tableLoading.style.display = "none";

    if (!res.ok) {
      console.error("GET error:", data);
      tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#e53935;">Failed to load employees.</td></tr>`;
      return;
    }

    const employees = data.employees || [];

    // Update stats
    const departments = new Set(employees.map(e => e.department).filter(Boolean));
    totalCount.textContent = employees.length;
    deptCount.textContent  = departments.size;

    if (employees.length === 0) {
      noData.style.display = "block";
      return;
    }

    // Sort by timestamp descending (newest first)
    employees.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Render rows
    employees.forEach((emp, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${emp.empId || "—"}</strong></td>
        <td>${emp.name || "—"}</td>
        <td>${emp.email || "—"}</td>
        <td>${emp.phone || "—"}</td>
        <td><span class="${getDeptClass(emp.department)}">${emp.department || "—"}</span></td>
        <td>${emp.role || "—"}</td>
        <td>${formatCurrency(emp.salary)}</td>
        <td>${formatDate(emp.joinDate)}</td>
        <td>${formatDate(emp.timestamp)}</td>
      `;
      tableBody.appendChild(row);
    });

  } catch (err) {
    console.error("Fetch error:", err);
    tableLoading.style.display = "none";
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#e53935;">Network error loading data.</td></tr>`;
  }
}

// =============================================
// Auto-load employees on page open
// =============================================
document.addEventListener("DOMContentLoaded", fetchEmployees);
