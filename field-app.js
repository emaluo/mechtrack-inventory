const config = window.MECHTRACK_SUPABASE;
const supabaseClient = window.supabase.createClient(config.url, config.publishableKey);

let session = null;
let profile = null;
let machines = [];
let locations = [];
let parts = [];
let inventoryItems = [];
let serialNumbers = [];
let stockMovements = [];
let profiles = [];
let selectedPartId = null;

const $ = (selector) => document.querySelector(selector);

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 3000);
}

function isAdmin() {
  return profile?.role === "admin";
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizeSerial(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "-");
}

function totalQuantity(partId) {
  return inventoryItems.filter((item) => item.part_id === partId).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function partRows(query = "") {
  const q = query.trim().toLowerCase();
  return parts.map((part) => {
    const machine = machines.find((item) => item.id === part.machine_id);
    const items = inventoryItems.filter((item) => item.part_id === part.id);
    const serials = serialNumbers.filter((item) => item.part_id === part.id);
    const itemLocations = items.map((item) => locations.find((location) => location.id === item.location_id)).filter(Boolean);
    const quantity = totalQuantity(part.id);
    return { part, machine, items, serials, locations: itemLocations, quantity, lowStock: quantity <= Number(part.low_stock || 0) };
  }).filter((row) => {
    if (!q) return true;
    return [row.part.name, row.part.sku, row.part.category, row.part.manufacturer, row.part.description, row.machine?.name, row.machine?.asset_tag, row.machine?.area, ...row.locations.map((location) => location.name), ...row.serials.map((serial) => serial.value)].join(" ").toLowerCase().includes(q);
  });
}

async function init() {
  const { data } = await supabaseClient.auth.getSession();
  session = data.session;
  supabaseClient.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    loadCloudApp();
  });
  await loadCloudApp();
}

async function loadCloudApp() {
  if (!session) {
    $("#authView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
    $("#signOutBtn").classList.add("hidden");
    return;
  }
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#signOutBtn").classList.remove("hidden");
  await loadAll();
}

async function loadAll() {
  $("#cloudStatus").textContent = "Loading cloud inventory...";
  const currentUserId = session.user.id;
  const [profileResult, machineResult, locationResult, partResult, inventoryResult, serialResult, movementResult] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("id", currentUserId).single(),
    supabaseClient.from("machines").select("*").order("name"),
    supabaseClient.from("locations").select("*").order("sort_order"),
    supabaseClient.from("parts").select("*").order("name"),
    supabaseClient.from("inventory_items").select("*"),
    supabaseClient.from("serial_numbers").select("*").order("value"),
    supabaseClient.from("stock_movements").select("*").order("created_at", { ascending: false })
  ]);
  [profileResult, machineResult, locationResult, partResult, inventoryResult, serialResult, movementResult].forEach((result) => {
    if (result.error) throw result.error;
  });
  profile = profileResult.data;
  machines = machineResult.data || [];
  locations = locationResult.data || [];
  parts = partResult.data || [];
  inventoryItems = inventoryResult.data || [];
  serialNumbers = serialResult.data || [];
  stockMovements = movementResult.data || [];
  selectedPartId = selectedPartId && parts.some((part) => part.id === selectedPartId) ? selectedPartId : parts[0]?.id || null;
  if (isAdmin()) {
    const userResult = await supabaseClient.from("profiles").select("*").order("created_at");
    if (userResult.error) throw userResult.error;
    profiles = userResult.data || [];
  } else {
    profiles = [];
  }
  $("#cloudStatus").textContent = `Signed in as ${profile.email}`;
  render();
}

function render() {
  const rows = partRows($("#searchInput").value);
  $("#metricRole").textContent = profile?.role || "-";
  $("#metricMachines").textContent = machines.length;
  $("#metricParts").textContent = parts.length;
  $("#metricUnits").textContent = inventoryItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  $("#metricLow").textContent = partRows("").filter((row) => row.lowStock && row.quantity > 0).length;
  $("#metricOut").textContent = partRows("").filter((row) => row.quantity === 0).length;
  $("#resultCount").textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
  renderSelects();
  renderInventory(rows);
  renderDetail();
  renderLookup();
  renderUsers();
}

function renderSelects() {
  $("#partMachineSelect").innerHTML = machines.map((machine) => `<option value="${machine.id}">${escapeHtml(machine.name)} - ${escapeHtml(machine.asset_tag)}</option>`).join("");
  $("#partLocationSelect").innerHTML = locations.map((location) => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("");
}

function renderInventory(rows) {
  if (!rows.length) {
    $("#inventoryList").innerHTML = `<div class="empty-state">No inventory matched the current search.</div>`;
    return;
  }
  $("#inventoryList").innerHTML = machines.map((machine) => {
    const machineRows = rows.filter((row) => row.part.machine_id === machine.id);
    if (!machineRows.length) return "";
    const machineQuantity = machineRows.reduce((sum, row) => sum + row.quantity, 0);
    const machineNoStock = machineRows.filter((row) => row.quantity === 0).length;
    return `<section class="machine-section"><div class="machine-header"><div><h3>${escapeHtml(machine.name)}</h3><div class="meta-line"><span>${escapeHtml(machine.asset_tag)}</span><span>${escapeHtml(machine.area || "No area")}</span><span>${machineRows.length} parts</span></div></div><div class="machine-counts"><span>${machineQuantity} units</span>${machineNoStock ? `<strong>${machineNoStock} no stock</strong>` : ""}</div></div><div class="machine-parts">${machineRows.map(renderPartRow).join("")}</div></section>`;
  }).join("");
}

function renderPartRow(row) {
  const status = row.quantity === 0 ? `<span class="status-pill out">No stock</span>` : row.lowStock ? `<span class="status-pill low">Low stock</span>` : `<span class="status-pill ok">In stock</span>`;
  const rowClass = row.quantity === 0 ? "out-of-stock" : row.lowStock ? "low-stock" : "";
  return `<button class="part-row ${rowClass} ${row.part.id === selectedPartId ? "selected" : ""}" data-part-id="${row.part.id}" type="button"><div><h3>${escapeHtml(row.part.name)}</h3><div class="meta-line"><span>${escapeHtml(row.part.sku)}</span><span>${escapeHtml(row.part.category || "Uncategorized")}</span><span>${escapeHtml(row.locations.map((loc) => loc.name).join(", ") || "No location")}</span><span>${row.serials.length} serials</span></div></div><div class="meta-line">${status}<span class="quantity-pill ${row.quantity === 0 ? "empty" : ""}">${row.quantity} ${escapeHtml(row.part.unit)}</span></div></button>`;
}

function renderDetail() {
  const row = partRows("").find((item) => item.part.id === selectedPartId);
  if (!row) {
    $("#detailTitle").textContent = "Select a part";
    $("#detailSku").textContent = "";
    $("#partDetail").className = "detail-empty";
    $("#partDetail").textContent = "Choose a machine part to inspect stock, serials, and movement history.";
    return;
  }
  $("#detailTitle").textContent = row.part.name;
  $("#detailSku").textContent = row.part.sku;
  const stockBanner = row.quantity === 0 ? `<div class="stock-alert">No stock available. Reorder or transfer inventory before issuing this part.</div>` : row.lowStock ? `<div class="stock-warning">Low stock. Current quantity is at or below the alert threshold.</div>` : "";
  const locationOptions = locations.map((location) => `<option value="${location.id}" ${location.id === row.items[0]?.location_id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("");
  const adminAdjustment = isAdmin() ? `<form id="adjustForm" class="form-stack detail-section"><h3>Adjust quantity</h3><label>Action<select name="movement_type"><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set counted quantity</option></select></label><label>Quantity<input name="quantity" type="number" min="1" step="1" value="1"></label><label>Location<select name="location_id">${locationOptions}</select></label><label>Reason<input name="reason" value="Manual adjustment"></label><button class="primary-button" type="submit">Save adjustment</button></form>` : "";
  const movements = stockMovements.filter((movement) => movement.part_id === row.part.id);
  $("#partDetail").className = "";
  $("#partDetail").innerHTML = `${stockBanner}<div class="machine-context"><strong>${escapeHtml(row.machine?.name || "Unknown machine")}</strong><span>${escapeHtml(row.machine?.asset_tag || "No asset tag")} - ${escapeHtml(row.machine?.area || "No area")}</span></div><p>${escapeHtml(row.part.description || "No description yet.")}</p>${adminAdjustment}<div class="detail-section"><h3>Locations</h3><ul class="compact-list">${row.items.map((item) => `<li class="${Number(item.quantity || 0) === 0 ? "zero-line" : ""}"><span>${escapeHtml(locations.find((location) => location.id === item.location_id)?.name || "Unknown")}</span><strong>${item.quantity === 0 ? "NO STOCK" : `${item.quantity} ${escapeHtml(row.part.unit)}`}</strong></li>`).join("") || "<li>No stock locations yet.</li>"}</ul></div><div class="detail-section"><h3>Serial numbers</h3><ul class="compact-list">${row.serials.map((serial) => `<li><span>${escapeHtml(serial.value)}</span><strong>${escapeHtml(serial.status)}</strong></li>`).join("") || "<li>No serial numbers tracked yet.</li>"}</ul></div><div class="detail-section"><h3>Movement history</h3><ul class="compact-list">${movements.slice(0, 8).map((move) => `<li><span>${escapeHtml(move.reason || "Adjustment")} (${escapeHtml(move.movement_type)})</span><strong>${move.quantity_delta} on ${formatDate(move.created_at)}</strong></li>`).join("") || "<li>No movements yet.</li>"}</ul></div>`;
}

function renderLookup() {
  const value = normalizeSerial($("#serialLookup").value);
  const result = $("#lookupResult");
  if (!value) {
    result.textContent = "Enter a serial number to find its machine, part, location, and status.";
    return;
  }
  const serial = serialNumbers.find((item) => item.value.includes(value) || value.includes(item.value));
  if (!serial) {
    result.innerHTML = `<strong>No match found.</strong><br>Check the serial number or ask an admin to add it.`;
    return;
  }
  const part = parts.find((item) => item.id === serial.part_id);
  const machine = machines.find((item) => item.id === part?.machine_id);
  const item = inventoryItems.find((inventoryItem) => inventoryItem.id === serial.inventory_item_id);
  const location = locations.find((loc) => loc.id === item?.location_id);
  result.innerHTML = `<strong>${escapeHtml(serial.value)}</strong><br>${escapeHtml(machine?.name || "Unknown machine")}<br>${escapeHtml(part?.name || "Unknown part")} (${escapeHtml(part?.sku || "No SKU")})<br>${escapeHtml(location?.name || "Unknown location")} - ${escapeHtml(serial.status)}`;
}

function renderUsers() {
  if (!isAdmin()) return;
  $("#userList").innerHTML = profiles.map((user) => `<div class="part-row"><div><h3>${escapeHtml(user.display_name || user.email)}</h3><div class="meta-line"><span>${escapeHtml(user.email)}</span><span>${escapeHtml(user.role)}</span></div></div><select class="role-select" data-user-id="${user.id}"><option value="standard" ${user.role === "standard" ? "selected" : ""}>standard</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option></select></div>`).join("");
}

function switchView(view) {
  document.querySelectorAll(".segment").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  $(`#${view}View`).classList.add("active-view");
}

async function createSerials(partId, inventoryItemId, serialText) {
  const values = String(serialText || "").split(/[\n,]+/).map(normalizeSerial).filter(Boolean);
  if (!values.length) return;
  const records = values.map((value) => ({ part_id: partId, inventory_item_id: inventoryItemId, value, status: "In stock" }));
  const { error } = await supabaseClient.from("serial_numbers").insert(records);
  if (error) throw error;
}

document.addEventListener("click", (event) => {
  const segment = event.target.closest(".segment");
  if (segment) switchView(segment.dataset.view);
  const row = event.target.closest(".part-row[data-part-id]");
  if (row) {
    selectedPartId = row.dataset.partId;
    render();
  }
});

document.addEventListener("change", async (event) => {
  if (!event.target.classList.contains("role-select")) return;
  try {
    const { error } = await supabaseClient.from("profiles").update({ role: event.target.value }).eq("id", event.target.dataset.userId);
    if (error) throw error;
    toast("User role updated.");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "authForm") {
      const data = Object.fromEntries(new FormData(event.target));
      const submitter = event.submitter?.value || "signin";
      const action = submitter === "signup" ? supabaseClient.auth.signUp : supabaseClient.auth.signInWithPassword;
      const result = await action.call(supabaseClient.auth, { email: data.email, password: data.password, options: { data: { display_name: data.email.split("@")[0] } } });
      if (result.error) throw result.error;
      toast(submitter === "signup" ? "Account created. Check email if confirmation is required." : "Signed in.");
      return;
    }
    if (event.target.id === "machineForm") {
      const payload = Object.fromEntries(new FormData(event.target));
      const { error } = await supabaseClient.from("machines").insert(payload);
      if (error) throw error;
      event.target.reset();
      toast("Machine added.");
      await loadAll();
      return;
    }
    if (event.target.id === "partForm") {
      const data = Object.fromEntries(new FormData(event.target));
      const quantity = Math.max(0, Number(data.quantity || 0));
      const serials = data.serials;
      const partResult = await supabaseClient.from("parts").insert({ machine_id: data.machine_id, name: data.name, sku: data.sku, category: data.category || null, manufacturer: data.manufacturer || null, description: data.description || null, unit: "ea", low_stock: Math.max(0, Number(data.low_stock || 0)) }).select("*").single();
      if (partResult.error) throw partResult.error;
      const itemResult = await supabaseClient.from("inventory_items").insert({ part_id: partResult.data.id, location_id: data.location_id, quantity, condition: quantity === 0 ? "Out of stock" : data.condition, notes: "" }).select("*").single();
      if (itemResult.error) throw itemResult.error;
      if (quantity > 0) {
        const movementResult = await supabaseClient.from("stock_movements").insert({ part_id: partResult.data.id, to_location_id: data.location_id, movement_type: "add", quantity_delta: quantity, reason: "Initial count", created_by: session.user.id });
        if (movementResult.error) throw movementResult.error;
      }
      await createSerials(partResult.data.id, itemResult.data.id, serials);
      selectedPartId = partResult.data.id;
      event.target.reset();
      switchView("dashboard");
      toast("Part added.");
      await loadAll();
      return;
    }
    if (event.target.id === "adjustForm") {
      const row = partRows("").find((item) => item.part.id === selectedPartId);
      const data = Object.fromEntries(new FormData(event.target));
      const quantity = Number(data.quantity || 0);
      const type = data.movement_type;
      const existing = inventoryItems.find((item) => item.part_id === selectedPartId && item.location_id === data.location_id);
      const previousQuantity = Number(existing?.quantity || 0);
      let nextQuantity = previousQuantity;
      if (type === "remove") {
        if (previousQuantity < quantity) throw new Error("Cannot remove more than current stock at this location.");
        nextQuantity = previousQuantity - quantity;
      } else if (type === "set") {
        nextQuantity = quantity;
      } else {
        nextQuantity = previousQuantity + quantity;
      }
      const delta = type === "remove" ? -quantity : type === "set" ? nextQuantity - previousQuantity : quantity;
      if (existing) {
        const updateResult = await supabaseClient.from("inventory_items").update({ quantity: nextQuantity, condition: nextQuantity === 0 ? "Out of stock" : "Available" }).eq("id", existing.id);
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertResult = await supabaseClient.from("inventory_items").insert({ part_id: row.part.id, location_id: data.location_id, quantity: nextQuantity, condition: nextQuantity === 0 ? "Out of stock" : "Available" });
        if (insertResult.error) throw insertResult.error;
      }
      const movementResult = await supabaseClient.from("stock_movements").insert({ part_id: row.part.id, from_location_id: type === "remove" ? data.location_id : null, to_location_id: type === "remove" ? null : data.location_id, movement_type: type, quantity_delta: delta, reason: data.reason, created_by: session.user.id });
      if (movementResult.error) throw movementResult.error;
      toast("Inventory adjusted.");
      await loadAll();
    }
  } catch (error) {
    toast(error.message);
  }
});

$("#searchInput").addEventListener("input", render);
$("#serialLookup").addEventListener("input", renderLookup);
$("#refreshBtn").addEventListener("click", () => loadAll().catch((error) => toast(error.message)));
$("#signOutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  session = null;
  profile = null;
  toast("Signed out.");
});

init().catch((error) => toast(error.message));
