const $ = (id) => document.getElementById(id);
const loginView = $("loginView");
const appView = $("appView");
const dialog = $("studentDialog");
let students = [];

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data.message || "Request failed.");
  }
  return data;
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
}
function showApp(name) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  $("adminName").textContent = name || "Admin";
  $("welcomeName").textContent = name || "Admin";
}
function toast(message, error = false) {
  $("toast").textContent = message;
  $("toast").style.color = error ? "#d04455" : "#4a9b79";
  setTimeout(() => { if ($("toast").textContent === message) $("toast").textContent = ""; }, 3500);
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginMessage").textContent = "";
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value })
    });
    showApp(result.admin.name);
    await refresh();
  } catch (error) {
    $("loginMessage").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
  showLogin();
});

$("addStudentBtn").addEventListener("click", () => openStudentDialog());
$("navStudents").addEventListener("click", () => $("searchInput").focus());
$("closeDialog").addEventListener("click", () => dialog.close());
$("cancelDialog").addEventListener("click", () => dialog.close());
$("departmentFilter").addEventListener("change", loadStudents);
let searchTimer;
$("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStudents, 250);
});

$("studentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("formMessage").textContent = "";
  const id = $("studentId").value;
  const payload = {
    name: $("studentName").value.trim(),
    roll_number: $("rollNumber").value.trim(),
    email: $("studentEmail").value.trim(),
    phone: $("studentPhone").value.trim(),
    department: $("studentDepartment").value,
    year: $("studentYear").value,
    gender: $("studentGender").value,
    section: $("studentSection").value.trim()
  };
  try {
    await api(id ? `/api/students/${id}` : "/api/students", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    dialog.close();
    toast(id ? "Student updated successfully." : "Student added successfully.");
    await refresh();
  } catch (error) {
    $("formMessage").textContent = error.message;
  }
});

function openStudentDialog(student = null) {
  $("studentForm").reset();
  $("studentId").value = student ? student.id : "";
  $("dialogTitle").textContent = student ? "Edit student" : "Add student";
  $("formMessage").textContent = "";
  if (student) {
    $("studentName").value = student.name || "";
    $("rollNumber").value = student.roll_number || "";
    $("studentEmail").value = student.email || "";
    $("studentPhone").value = student.phone || "";
    $("studentDepartment").value = student.department || "";
    $("studentYear").value = student.year || "";
    $("studentGender").value = student.gender || "";
    $("studentSection").value = student.section || "";
  }
  dialog.showModal();
}

async function refresh() {
  await Promise.all([loadDashboard(), loadStudents()]);
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  $("totalCount").textContent = data.total;
  $("recordCount").textContent = data.total;
  $("departmentCount").textContent = data.departments.length;
  const filter = $("departmentFilter");
  const selected = filter.value || "all";
  filter.innerHTML = '<option value="all">All departments</option>';
  data.departments.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.department;
    option.textContent = `${item.department} (${item.count})`;
    filter.appendChild(option);
  });
  filter.value = [...filter.options].some((option) => option.value === selected) ? selected : "all";
}

async function loadStudents() {
  try {
    const params = new URLSearchParams({
      department: $("departmentFilter").value || "all",
      search: $("searchInput").value.trim()
    });
    students = await api(`/api/students?${params.toString()}`);
    renderStudents(students);
  } catch (error) {
    $("studentTable").innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderStudents(list) {
  $("tableSummary").textContent = `Showing ${list.length} student${list.length === 1 ? "" : "s"}`;
  if (!list.length) {
    $("studentTable").innerHTML = '<tr><td colspan="6" class="empty">No students found. Add a student to get started.</td></tr>';
    return;
  }
  $("studentTable").innerHTML = list.map((student) => {
    const initials = student.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    return `<tr>
      <td><div class="student-name"><div class="student-avatar">${escapeHtml(initials)}</div>${escapeHtml(student.name)}</div></td>
      <td>${escapeHtml(student.roll_number)}</td>
      <td><span class="dept-pill">${escapeHtml(student.department)}</span></td>
      <td>${escapeHtml(student.year || "—")}</td>
      <td>${escapeHtml(student.section || "—")}</td>
      <td><div class="actions"><button class="icon-btn" data-edit="${student.id}" title="Edit">✎</button><button class="icon-btn" data-delete="${student.id}" title="Delete">⌫</button></div></td>
    </tr>`;
  }).join("");

  $("studentTable").querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const student = students.find((item) => String(item.id) === button.dataset.edit);
      if (student) openStudentDialog(student);
    });
  });
  $("studentTable").querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const student = students.find((item) => String(item.id) === button.dataset.delete);
      if (!student || !confirm(`Delete ${student.name} (${student.roll_number})?`)) return;
      try {
        await api(`/api/students/${student.id}`, { method: "DELETE" });
        toast("Student deleted.");
        await refresh();
      } catch (error) { toast(error.message, true); }
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

(async function start() {
  try {
    const result = await api("/api/me");
    showApp(result.admin.name);
    await refresh();
  } catch (_) {
    showLogin();
  }
})();
