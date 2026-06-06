export default {
async fetch(request, env) {
const url = new URL(request.url);

const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type",
};

const jsonHeaders = {
...corsHeaders,
"Content-Type": "application/json"
};

if (request.method === "OPTIONS") {
return new Response("OK", { headers: corsHeaders });
}


async function getAddress(lat, lng) {

const url =
`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCKPgb6poNgqg5mZLdj-oqowdEwXP4UB90`;

const res = await fetch(url);
const data = await res.json();

return data.results?.[0]?.formatted_address || "";

}

// ================= REGISTER REQUEST =================
if (url.pathname === "/api/register" && request.method === "POST") {
  try {
    const data = await request.json();

    if (!data.name || !data.email || !data.phone) {
      return new Response(JSON.stringify({ 
        status: "Fail", 
        message: "Name, Email and Phone required" 
      }), { status: 400, headers: jsonHeaders });
    }

    // Check duplicate email
    const existing = await env.arm_db.prepare(
      "SELECT email FROM register_requests WHERE email = ?"
    ).bind(data.email).first();

    if (existing) {
      return new Response(JSON.stringify({ 
        status: "Fail", 
        message: "Request already submitted with this email" 
      }), { status: 400, headers: jsonHeaders });
    }

    await env.arm_db.prepare(
      `INSERT INTO register_requests (name, email, phone, status, created_at)
       VALUES (?, ?, ?, 'PENDING', ?)`
    ).bind(data.name, data.email, data.phone, Date.now()).run();

    return new Response(JSON.stringify({ 
      status: "Success", 
      message: "Request submitted! We will contact you within 24 hours." 
    }), { headers: jsonHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, headers: jsonHeaders 
    });
  }
}

// ================= ✅ ADMIN LOGIN (Fixed & Structurer) =================
        if (url.pathname === "/api/admin-login" && request.method === "POST") {
    try {
        const { adminId, password } = await request.json();
        
        const admin = await env.arm_db.prepare(
            "SELECT * FROM admins WHERE id = ? AND password = ?"
        ).bind(adminId, password).first();

        if (admin) {
            return new Response(JSON.stringify({ 
                success: true, 
                token: 'true_authenticated_user',
                adminId: admin.id,                                    // ✅ ID bhejo
                password_changed_at: admin.password_changed_at || 0  // ✅ Timestamp bhejo
            }), { headers: jsonHeaders });
        } else {
            return new Response(JSON.stringify({ 
                success: false, 
                message: "Invalid Credentials" 
            }), { status: 401, headers: jsonHeaders });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { 
            status: 500, headers: jsonHeaders 
        });
    }
}

// ================= ADMINS MANAGEMENT =================

// GET ALL ADMINS (with role name)
if (url.pathname === "/api/admins" && request.method === "GET") {
    try {
        const { results } = await env.arm_db.prepare(`
            SELECT a.id, a.name, a.email, a.status, a.password_changed_at,
                   r.role_name, a.role_id
            FROM admins a
            LEFT JOIN roles r ON a.role_id = r.id
            WHERE a.status != 'DELETED'
            ORDER BY a.id ASC
        `).all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// CREATE ADMIN
if (url.pathname === "/api/admins" && request.method === "POST") {
    try {
        const data = await request.json();
        if (!data.id || !data.password) {
            return new Response(JSON.stringify({ error: "ID and password required" }), { status: 400, headers: jsonHeaders });
        }
        const existing = await env.arm_db.prepare("SELECT id FROM admins WHERE id = ?").bind(data.id).first();
        if (existing) {
            return new Response(JSON.stringify({ error: "Admin ID already exists" }), { status: 400, headers: jsonHeaders });
        }
        await env.arm_db.prepare(
            "INSERT INTO admins (id, name, email, password, role_id, status, password_changed_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)"
        ).bind(data.id, data.name, data.email || "", data.password, data.role_id || null, Date.now()).run();

        // Permissions save karo
        if (data.permissions && data.permissions.length > 0) {
            for (const perm of data.permissions) {
                await env.arm_db.prepare(
                    "INSERT INTO admin_permissions (admin_id, module, can_read, can_write, created_at) VALUES (?, ?, ?, ?, ?)"
                ).bind(data.id, perm.module, perm.can_read ? 1 : 0, perm.can_write ? 1 : 0, Date.now()).run();
            }
        }
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// UPDATE ADMIN
if (url.pathname.startsWith("/api/admins/") && request.method === "PUT") {
    try {
        const adminId = url.pathname.split("/api/admins/")[1];
        const data = await request.json();

        // Basic info update
        await env.arm_db.prepare(
            "UPDATE admins SET name = ?, email = ?, role_id = ?, status = ? WHERE id = ?"
        ).bind(data.name, data.email || "", data.role_id || null, data.status || 'ACTIVE', adminId).run();

        // Password update (agar bheja ho)
        if (data.password && data.password.trim() !== "") {
            await env.arm_db.prepare(
                "UPDATE admins SET password = ?, password_changed_at = ? WHERE id = ?"
            ).bind(data.password, Date.now(), adminId).run();
        }

        // Permissions update
        if (data.permissions) {
            await env.arm_db.prepare("DELETE FROM admin_permissions WHERE admin_id = ?").bind(adminId).run();
            for (const perm of data.permissions) {
                await env.arm_db.prepare(
                    "INSERT INTO admin_permissions (admin_id, module, can_read, can_write, created_at) VALUES (?, ?, ?, ?, ?)"
                ).bind(adminId, perm.module, perm.can_read ? 1 : 0, perm.can_write ? 1 : 0, Date.now()).run();
            }
        }
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// DELETE ADMIN
if (url.pathname.startsWith("/api/admins/") && request.method === "DELETE") {
    try {
        const adminId = url.pathname.split("/api/admins/")[1];
        await env.arm_db.prepare("UPDATE admins SET status = 'DELETED' WHERE id = ?").bind(adminId).run();
        await env.arm_db.prepare("DELETE FROM admin_permissions WHERE admin_id = ?").bind(adminId).run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// GET ADMIN PERMISSIONS
if (url.pathname.startsWith("/api/admin-permissions/") && request.method === "GET") {
    try {
        const adminId = url.pathname.split("/api/admin-permissions/")[1];
        const { results } = await env.arm_db.prepare(
            "SELECT * FROM admin_permissions WHERE admin_id = ?"
        ).bind(adminId).all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}


                // ===== SESSION CHECK =====
if (url.pathname === "/api/check-session" && request.method === "POST") {
    try {
        const { adminId, password_changed_at } = await request.json();
        
        const admin = await env.arm_db.prepare(
            "SELECT password_changed_at FROM admins WHERE id = ?"
        ).bind(adminId).first();

        if (!admin) {
            return new Response(JSON.stringify({ valid: false }), { headers: jsonHeaders });
        }

        if ((admin.password_changed_at || 0) !== parseInt(password_changed_at)) {
            return new Response(JSON.stringify({ valid: false }), { headers: jsonHeaders });
        }

        return new Response(JSON.stringify({ valid: true }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}



// ================= LOGIN =================
if (url.pathname === "/api/login" && request.method === "POST") {

try {

const data = await request.json();

// employee find
const employee = await env.arm_db
.prepare("SELECT * FROM employees WHERE emp_id = ? AND email = ?")
.bind(data.emp_id, data.email)
.first();

if (!employee) {
return new Response(
JSON.stringify({ status: "Fail", message: "Invalid ID or Email" }),
{ status: 401, headers: jsonHeaders }
);
}

// account blocked check
if (employee.status === "PAUSED" || employee.status === "DELETED") {
return new Response(
JSON.stringify({
status: "Fail",
message: "Account " + employee.status + ". Contact Admin."
}),
{ status: 403, headers: jsonHeaders }
);
}

// 🔒 DEVICE LOCK CHECK
const isDemoAccount = (data.emp_id === "apple_demo" && data.email === "demo1@armkendra.com");

if (!isDemoAccount && employee.device_id && employee.device_id !== data.device_id) {
    return new Response(
        JSON.stringify({
            status: "Fail",
            message: "Account already logged in another device"
        }),
        { status: 403, headers: jsonHeaders }
    );
}

// ✅ हमेशा device_id update करो
await env.arm_db
    .prepare("UPDATE employees SET device_id = ? WHERE emp_id = ?")
    .bind(data.device_id, data.emp_id)
    .run();

return new Response(
JSON.stringify({ status: "Success", data: employee }),
{ headers: jsonHeaders }
);

} catch (e) {

return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders
});

}

}

// ================= PUNCH (With Ultimate Battery Fix) =================
if (url.pathname === "/api/punch" && request.method === "POST") {
    try {
        const data = await request.json();
        // 🚨 BLOCK PUNCH IF FAKE GPS
if (data.is_mock === true) {

return new Response(
JSON.stringify({
status: "Fail",
message: "Fake GPS detected. Punch blocked."
}),
{ status: 403, headers: jsonHeaders }
);

}
        const timestamp = Date.now();
const istOffset = 5.5 * 60 * 60 * 1000;
const workDate = new Date(Date.now() + istOffset).toISOString().split('T')[0];
        // बैटरी निकालने का सबसे सुरक्षित तरीका
        let batteryVal = "0";
        if (data.battery !== undefined && data.battery !== null) {
            batteryVal = typeof data.battery === 'object' ? (data.battery.level || data.battery.value || "0") : data.battery;
        } else if (data.battery_level !== undefined && data.battery_level !== null) {
            batteryVal = data.battery_level;
        }

        await env.arm_db
            .prepare(
                `INSERT INTO attendance (emp_id, name, type, time, location, timestamp, work_date, battery)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
data.emp_id,
data.name || "Unknown",
data.type,
data.time,
data.location || "0,0",
timestamp,
workDate,
String(batteryVal)
)
            .run();



           // ===== SAVE TIMELINE EVENT =====
        // lat/lng directly bhi accept karo agar location string nahi hai
let lat, lng;
if(data.lat && data.lng){
    lat = String(data.lat);
    lng = String(data.lng);
} else {
    lat = (data.location || "0,0").split(",")[0];
    lng = (data.location || "0,0").split(",")[1];
}

        let punchLat = lat;
        let punchLng = lng;
        let punchAddress = await getAddress(lat, lng);

        if(data.type === "PUNCH OUT"){
            const lastLoc = await env.arm_db.prepare(
                "SELECT lat, lng FROM location_history WHERE emp_id = ? ORDER BY timestamp DESC LIMIT 1"
            ).bind(data.emp_id).first();

            if(lastLoc){
                punchLat = lastLoc.lat;
                punchLng = lastLoc.lng;
                punchAddress = await getAddress(punchLat, punchLng);
            }
        }

        
        await env.arm_db.prepare(`
        INSERT INTO timeline_events
        (emp_id, event_type, lat, lng, distance, duration, event_time, address, battery)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            data.emp_id,
            data.type === "PUNCH IN" ? "PUNCH_IN" : "PUNCH_OUT",
            punchLat,
            punchLng,
            0,
            0,
            timestamp,
            punchAddress,
            batteryVal
        )
        .run();

        if (data.type === "PUNCH OUT") {
            await env.arm_db
                .prepare("DELETE FROM live_locations WHERE emp_id = ?")
                .bind(data.emp_id)
                .run();
        }
   if (data.type === "PUNCH IN") {
    // ❌ UPDATE hatao — ye timestamp reset karta tha
    // ✅ Sirf agar koi point nahi hai to insert karo
    const checkPoint = await env.arm_db.prepare(
        "SELECT id FROM location_history WHERE emp_id = ? LIMIT 1"
    ).bind(data.emp_id).first();
    
    if(!checkPoint){
        await env.arm_db.prepare(
            "INSERT INTO location_history (emp_id, lat, lng, battery, timestamp) VALUES (?, ?, ?, ?, ?)"
        ).bind(data.emp_id, lat, lng, batteryVal, timestamp).run();
    }
}

        return new Response(
            JSON.stringify({ status: "Success", message: "Punch Saved" }),
            { headers: jsonHeaders }
        );
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: jsonHeaders,
        });
    }
}



// ================= SAVE DAILY DISTANCE =================
if (url.pathname === "/api/save-daily-distance" && request.method === "POST") {
    try {
        const data = await request.json();
        
        // Employee name fetch करो
        const emp = await env.arm_db.prepare(
            "SELECT name FROM employees WHERE emp_id = ?"
        ).bind(data.emp_id).first();
        
        const empName = emp?.name || "Unknown";
        
        await env.arm_db.prepare(`
            INSERT INTO daily_distance (emp_id, emp_name, work_date, total_km, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(emp_id, work_date) 
            DO UPDATE SET 
                total_km = excluded.total_km,
                emp_name = excluded.emp_name,
                updated_at = excluded.updated_at
        `).bind(
            data.emp_id,
            empName,
            data.work_date,
            parseFloat(data.total_km) || 0,
            Date.now()
        ).run();
        
        return new Response(JSON.stringify({ status: "Success" }), {
            headers: jsonHeaders
        });
    } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: jsonHeaders
        });
    }
}

// ================= GET ALL EMPLOYEES DISTANCE BY DATE =================
if (url.pathname === "/api/daily-distance-report" && request.method === "GET") {
    try {
        const date = url.searchParams.get("date");
        
        const { results } = await env.arm_db.prepare(`
            SELECT 
                d.emp_id,
                d.emp_name,
                d.work_date,
                d.total_km,
                d.updated_at
            FROM daily_distance d
            WHERE d.work_date = ?
            ORDER BY d.total_km DESC
        `).bind(date).all();
        
        return new Response(JSON.stringify(results), {
            headers: jsonHeaders
        });
    } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: jsonHeaders
        });
    }
}



// ================= TASK REPORT (FINAL FIX FOR REAL NAMES) =================
if (url.pathname === "/api/task" && request.method === "POST") {
    try {
        const data = await request.json();
        let finalPhotoUrl = "";

        // 📸 R2 PHOTO UPLOAD LOGIC
        if (data.photo_url && data.photo_url.length > 100) {
            const fileName = `task_${Date.now()}.jpg`;
            const binaryString = atob(data.photo_url);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            await env.arm_bucket.put(fileName, bytes, {
                httpMetadata: { contentType: "image/jpeg" }
            });
            // ⚠️ अपना असली R2 Public URL यहाँ चेक कर लें
            finalPhotoUrl = `https://pub-ff727853064a4226a7fffb17740a0615.r2.dev/${fileName}`; 
        }

        // 🚀 असली सुधार: 'dynamic_data' को ही सीधा 'task_data' बना दें
        // इससे डेटाबेस में वही "Labels" (BC Name, BC Contact) जाएंगे जो आपने एडमिन पैनल में रखे हैं
        // ✅ File fields को R2 पर upload करो
const rawDynamic = data.dynamic_data || {};
const processedDynamic = {};

for (const [key, value] of Object.entries(rawDynamic)) {
    if (key.endsWith('_filename')) continue; // skip filename fields
    
    // Base64 file detect करो (1000+ chars = file)
    if (typeof value === 'string' && value.length > 1000) {
        const fileName = rawDynamic[`${key}_filename`] || `file_${Date.now()}`;
        const ext = fileName.split('.').pop().toLowerCase();
        const r2Key = `task_files/${Date.now()}_${fileName}`;
        
        let contentType = 'application/octet-stream';
        if (ext === 'pdf') contentType = 'application/pdf';
        else if (ext === 'xlsx' || ext === 'xls') contentType = 'application/vnd.ms-excel';
        else if (['jpg','jpeg','png'].includes(ext)) contentType = 'image/jpeg';
        
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        await env.arm_bucket.put(r2Key, bytes, {
            httpMetadata: { contentType }
        });
        
        // R2 URL save करो
        processedDynamic[key] = `https://pub-ff727853064a4226a7fffb17740a0615.r2.dev/${r2Key}`;
    } else {
        processedDynamic[key] = value;
    }
}
        const taskDataToSave = Object.keys(processedDynamic).length > 0 ? processedDynamic : {
            bank_name: data.bank_name || "N/A",
            person_met: data.person || "N/A",
            contact_phone: data.contact_number || "N/A",
            purpose: data.purpose || "N/A"
        };

        await env.arm_db
            .prepare(`INSERT INTO tasks (task_master_id, emp_id, task_name, task_data, photo_url, latitude, longitude, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(
                data.task_master_id || 0,
                data.emp_id,
                data.task_name || "New Task",
                JSON.stringify(taskDataToSave), // ✅ अब इसमें असली नाम वाली चाबियाँ (Keys) सेव होंगी
                finalPhotoUrl,
                String(data.lat || "0.0"), 
                String(data.lng || "0.0"), 
                data.address || "No Address",
                new Date().toISOString()
            )
            .run();

            // ===== SAVE TASK TIMELINE EVENT =====

await env.arm_db.prepare(`
INSERT INTO timeline_events
(emp_id,event_type,lat,lng,distance,duration,event_time,address,battery)
VALUES (?,?,?,?,?,?,?,?,?)
`)
.bind(
data.emp_id,
"TASK",
data.lat || 0,
data.lng || 0,
0,
0,
Date.now(),
data.address || "",
data.battery || 0
)
.run();



        return new Response(JSON.stringify({ status: "Success", message: "Task Saved with Real Names" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// ================= FAST RANGE STATS (FOR REPORT MATRIX) =================
if (url.pathname === "/api/stats-range" && request.method === "GET") {
try {

const start = url.searchParams.get("start");
const end = url.searchParams.get("end");

// attendance data
const punches = await env.arm_db
.prepare(`
SELECT emp_id,
work_date as date,
type,
time
FROM attendance
WHERE work_date BETWEEN ? AND ?
`)
.bind(start, end)
.all();

// tasks data
const tasks = await env.arm_db
.prepare(`
SELECT 
emp_id,
DATE(created_at) as date,
task_name,
address
FROM tasks
WHERE DATE(created_at) BETWEEN ? AND ?
`)
.bind(start, end)
.all();

const map = {};

// punches map
(punches.results || []).forEach(p => {
const key = `${p.emp_id}_${p.date}`;

if (!map[key]) {
map[key] = {
emp_id: p.emp_id,
date: p.date,
punches: [],
tasks: []
};
}

map[key].punches.push({
type: p.type,
time: p.time
});

});

// ================= CALCULATE PUNCH DATA =================

Object.values(map).forEach(r => {

const ins = r.punches
.filter(p => p.type === "PUNCH IN" && p.time)
.map(p => new Date(p.time))
.filter(d => !isNaN(d));

const outs = r.punches
.filter(p => p.type === "PUNCH OUT" && p.time)
.map(p => new Date(p.time))
.filter(d => !isNaN(d));

if(ins.length){

const firstIn = new Date(Math.min(...ins.map(d=>d.getTime())));

r.punch_in = firstIn.toISOString();

}

if(outs.length){

const lastOut = new Date(Math.max(...outs));

r.punch_out = lastOut.toISOString();

}

if(ins.length && outs.length){

const diff =
(new Date(Math.max(...outs)) -
new Date(Math.min(...ins)))
/ (1000*60*60);

r.login_hrs = diff.toFixed(2);

}

});




// tasks map
(tasks.results || []).forEach(t => {

const key = `${t.emp_id}_${t.date}`;

if (!map[key]) {
map[key] = {
emp_id: t.emp_id,
date: t.date,
punches: [],
tasks: []
};
}

map[key].tasks.push({
task_name: t.task_name,
address: t.address
});

});

// ✅ daily_distance से distance fetch करो
const { results: distances } = await env.arm_db.prepare(`
    SELECT emp_id, work_date, total_km 
    FROM daily_distance
    WHERE work_date BETWEEN ? AND ?
`).bind(start, end).all();

// map में distance add करो
(distances || []).forEach(d => {
    const key = `${d.emp_id}_${d.work_date}`;
    if (map[key]) {
        map[key].distance = d.total_km + " Km";
    }
});

return new Response(JSON.stringify(Object.values(map)), {
headers: jsonHeaders
});

} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders
});
}
}

// ================= STATS FOR DASHBOARD (FIXED FOR ISO STRINGS) =================

if (url.pathname === "/api/stats" && request.method === "GET") {
    try {
        const emp_id = url.searchParams.get("emp_id");
        const dateStr = url.searchParams.get("date"); // मान लो '2026-03-02'

        // 1. आज के टास्क (ISO String को सीधे LIKE से चेक करें)
       const taskDetailsResult = await env.arm_db
.prepare(`
SELECT 
id,
task_name,
task_data,
photo_url,
address,
latitude,
longitude,
created_at,
strftime('%s', created_at) * 1000 as timestamp
FROM tasks
WHERE emp_id = ? 
AND DATE(datetime(created_at, '+5 hours', '30 minutes')) = ?
ORDER BY created_at ASC
`)
.bind(emp_id, dateStr)
.all();
        const taskCount = taskDetailsResult.results ? taskDetailsResult.results.length : 0;

        // 2. आज के पंच (हाजिरी)
        const punches = await env.arm_db
            .prepare("SELECT type, timestamp, time, battery FROM attendance WHERE emp_id = ? AND (timestamp LIKE ? OR time LIKE ?) ORDER BY timestamp ASC")
            .bind(emp_id, `%${dateStr}%`, `%${dateStr}%`)
            .all();

        // 🚀 वर्क आवर्स कैलकुलेशन (सिंपल और सेफ)
        let totalWorkSeconds = 0;
        let lastPunchIn = null;
        if (punches.results) {
            punches.results.forEach(p => {
                const pTs = (typeof p.timestamp === 'number') ? p.timestamp : new Date(p.time).getTime();
                if (p.type === "PUNCH IN") lastPunchIn = pTs;
                else if (p.type === "PUNCH OUT" && lastPunchIn) {
                    totalWorkSeconds += Math.floor((pTs - lastPunchIn) / 1000);
                    lastPunchIn = null;
                }
            });
        }
        // ================= DISTANCE CALCULATION =================

const savedDist = await env.arm_db.prepare(`
    SELECT total_km FROM daily_distance
    WHERE emp_id = ? AND work_date = ?
`).bind(emp_id, dateStr).first();

const totalDistance = savedDist?.total_km || 0;

        const h = Math.floor(totalWorkSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalWorkSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalWorkSeconds % 60).toString().padStart(2, '0');

        return new Response(
            JSON.stringify({
                work_hours: `${h}:${m}:${s}`,
                tasks_completed: taskCount,
                tasks: taskDetailsResult.results || [], // ✅ 'task_list' को 'tasks' कर दिया
                punches: punches.results || [],
                distance: parseFloat(totalDistance).toFixed(2) + " Km"
            }),
            { headers: jsonHeaders }
        );
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// ================= SAVE PERMISSIONS LOG =================
if (url.pathname === "/api/save-permissions" && request.method === "POST") {
try {
const data = await request.json();
await env.arm_db
.prepare(`
INSERT INTO permissions_log (emp_id, location_allowed, mic_allowed, camera_allowed, battery_all, timestamp)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(emp_id) DO UPDATE SET
location_allowed = excluded.location_allowed,
mic_allowed = excluded.mic_allowed,
camera_allowed = excluded.camera_allowed,
battery_all = excluded.battery_all,
timestamp = excluded.timestamp
`)
.bind(
data.emp_id,
data.location_allowed ? 1 : 0,
data.mic_allowed ? 1 : 0,
data.camera_allowed ? 1 : 0,
data.battery_all ? 1 : 0,
Date.now()
)
.run();

return new Response(JSON.stringify({ status: "Success" }), {
headers: jsonHeaders,
});
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});
}
}


// ================= SAVE TIMELINE EVENT =================
if (url.pathname === "/api/save-timeline" && request.method === "POST") {

try {

const data = await request.json();

await env.arm_db.prepare(`
INSERT INTO timeline_events
(emp_id, event_type, lat, lng, distance, duration, event_time, address, battery)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
.bind(
data.emp_id,
data.event_type,
data.lat || 0,
data.lng || 0,
data.distance || 0,
data.duration || 0,
data.event_time || Date.now(),
data.address || "",
data.battery || 0
)
.run();

return new Response(JSON.stringify({status:"saved"}),{headers: jsonHeaders});

} catch(e){

return new Response(JSON.stringify({error:e.message}),{
status:500,
headers:jsonHeaders
});

}

}


// ================= GET TIMELINE =================
if (url.pathname === "/api/timeline" && request.method === "GET") {

try {

const empId = url.searchParams.get("emp_id");
const date = url.searchParams.get("date");

// ================= 1. GET TIMELINE EVENTS =================
const { results } = await env.arm_db.prepare(`
SELECT 
event_type,
lat,
lng,
distance,
duration,
address,
battery,
event_time,
datetime(event_time/1000,'unixepoch') as time
FROM timeline_events
WHERE emp_id = ?
AND DATE(datetime(event_time/1000,'unixepoch')) = ?
ORDER BY event_time ASC
`)
.bind(empId, date)
.all();

// ================= 2. GET TASKS =================
const { results: taskRows } = await env.arm_db.prepare(`
SELECT 
    id,
    task_name,
    task_data,
    photo_url,
    latitude as lat,
    longitude as lng,
    address,
    created_at,
    strftime('%s', created_at) * 1000 as event_time
FROM tasks
WHERE emp_id = ?
AND DATE(created_at) = ?
`)
.bind(empId, date)
.all();

// ================= 3. CONVERT TASKS =================
const taskEvents = (taskRows || []).map(t => ({
    event_type: "TASK",
    task_id: t.id,
    task_name: t.task_name,
    description: t.task_data,
    photo_url: t.photo_url,
    lat: t.lat,
    lng: t.lng,
    address: t.address,
    event_time: t.event_time
}));

// ================= 4. MERGE + SORT =================
const finalTimeline = [
    ...(results || []).filter(e => e.event_type !== "TASK"), // ❌ remove dummy TASK
    ...taskEvents // ✅ real TASK
].sort((a,b)=>a.event_time - b.event_time);

// ================= 5. RETURN =================
return new Response(JSON.stringify(finalTimeline),{
    headers: jsonHeaders
});

} catch(e){

return new Response(JSON.stringify({error:e.message}),{
    status:500,
    headers:jsonHeaders
});

}

}



// ================= LOG PERMISSION CHANGES =================
if (url.pathname === "/api/permission-history" && request.method === "POST") {
try {
const data = await request.json();
await env.arm_db
.prepare(`
INSERT INTO permission_history (emp_id, action_type, status_value, timestamp, battery_level)
VALUES (?, ?, ?, ?, ?)
`)
.bind(
data.emp_id,
data.action_type,
data.status_value ? 1 : 0,
Date.now(),
data.battery_level || 0
)
.run();

return new Response(JSON.stringify({ status: "Success", message: "History Logged" }), {
headers: jsonHeaders,
});
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});
}
}

// ================= FAKE GPS LOG =================
if (url.pathname === "/api/fake-gps" && request.method === "POST") {

try {

const data = await request.json();

// employee name fetch
const emp = await env.arm_db
.prepare("SELECT name FROM employees WHERE emp_id = ?")
.bind(data.emp_id)
.first();

const empName = emp?.name || "Unknown";

await env.arm_db
.prepare(`
INSERT INTO fake_gps_logs
(emp_id, emp_name, lat, lng, device, reason, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`)
.bind(
data.emp_id,
empName,
data.lat,
data.lng,
data.device || "mobile",
"Fake GPS Detected",
Date.now()
)
.run();

return new Response(
JSON.stringify({ status: "logged" }),
{ headers: jsonHeaders }
);

} catch (e) {

return new Response(
JSON.stringify({ error: e.message }),
{ status: 500, headers: jsonHeaders }
);

}

}



// ================= PUSH LIVE LOCATION =================
if (url.pathname === "/api/push-location" && request.method === "POST") {

try {

const data = await request.json();

// 🚨 BLOCK FAKE GPS
if (data.is_mock === true) {

await env.arm_db.prepare(`
INSERT INTO fake_gps_logs
(emp_id, emp_name, lat, lng, device, reason, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`)
.bind(
data.emp_id,
data.name || "Unknown",
data.lat,
data.lng,
"mobile",
"Fake GPS Detected",
Date.now()
)
.run();

return new Response(
JSON.stringify({
status: "blocked",
message: "Fake GPS detected"
}),
{ headers: jsonHeaders }
);

}
// ✅ Battery only — sirf live_locations update karo
if (data.battery_only === true) {
    const now = Date.now();
    const saveTimestamp = (data.offline_sync && data.original_timestamp)
        ? parseInt(data.original_timestamp)
        : now;

    // ✅ Live location update
    await env.arm_db.prepare(
        `INSERT INTO live_locations (emp_id, name, lat, lng, battery, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(emp_id) DO UPDATE SET
         name=excluded.name, lat=excluded.lat, lng=excluded.lng,
         battery=excluded.battery, updated_at=excluded.updated_at`
    ).bind(data.emp_id, data.name||"Unknown", data.lat, data.lng, data.battery||0, now).run();

    // ✅ location_history save
    const lastPoint = await env.arm_db.prepare(`
        SELECT lat, lng, timestamp FROM location_history
        WHERE emp_id = ?
        AND DATE(datetime(timestamp/1000,'unixepoch')) = ?
        ORDER BY timestamp DESC LIMIT 1
    `).bind(data.emp_id, new Date().toISOString().split("T")[0]).first();

    await env.arm_db.prepare(
        `INSERT INTO location_history (emp_id, lat, lng, battery, timestamp) VALUES (?, ?, ?, ?, ?)`
   ).bind(data.emp_id, data.lat, data.lng, data.battery||0, saveTimestamp).run();

    // ✅ TRAVEL logic
    if(lastPoint) {
        const R = 6371;
        const dLat = (parseFloat(data.lat)-parseFloat(lastPoint.lat))*Math.PI/180;
        const dLon = (parseFloat(data.lng)-parseFloat(lastPoint.lng))*Math.PI/180;
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(parseFloat(lastPoint.lat)*Math.PI/180)*
            Math.cos(parseFloat(data.lat)*Math.PI/180)*
            Math.sin(dLon/2)*Math.sin(dLon/2);
        const distance = R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

        if(distance >= 0.1 && distance < 0.5) {
            const todayDate = new Date().toISOString().split("T")[0];

            const activePunch = await env.arm_db.prepare(
                "SELECT id FROM attendance WHERE emp_id=? AND work_date=? AND type='PUNCH IN' ORDER BY id DESC LIMIT 1"
            ).bind(data.emp_id, todayDate).first();

            const lastPunchOut = await env.arm_db.prepare(
                "SELECT id FROM attendance WHERE emp_id=? AND work_date=? AND type='PUNCH OUT' ORDER BY id DESC LIMIT 1"
            ).bind(data.emp_id, todayDate).first();

            const isPunchedIn = activePunch && (!lastPunchOut || activePunch.id > lastPunchOut.id);

            if(isPunchedIn) {
                const lastTravel = await env.arm_db.prepare(`
                    SELECT id, event_time FROM timeline_events
                    WHERE emp_id=? AND event_type='TRAVEL'
                    AND DATE(datetime(event_time/1000,'unixepoch'))=?
                    ORDER BY event_time DESC LIMIT 1
                `).bind(data.emp_id, todayDate).first();

                const shouldInsertNew = !lastTravel || (saveTimestamp - lastTravel.event_time) > 1800000;

                if(shouldInsertNew) {
                    const address = await getAddress(data.lat, data.lng);
                    await env.arm_db.prepare(`
                        INSERT INTO timeline_events
                        (emp_id,event_type,lat,lng,distance,duration,event_time,address,battery)
                        VALUES (?,?,?,?,?,?,?,?,?)
                    `).bind(data.emp_id,"TRAVEL",data.lat,data.lng,
    parseFloat(distance.toFixed(4)),0,saveTimestamp,address,data.battery||0).run();
                } else {
                    await env.arm_db.prepare(
                        `UPDATE timeline_events SET distance=distance+?, duration=?-event_time WHERE id=?`
).bind(parseFloat(distance.toFixed(4)), saveTimestamp, lastTravel.id).run();
                }
            }
        }
    }

    return new Response(JSON.stringify({ status: "OK" }), { headers: jsonHeaders });
}

const emp = await env.arm_db
.prepare("SELECT name FROM employees WHERE emp_id = ?")
.bind(data.emp_id)
.first();

const empName = emp?.name || data.name || "Unknown";
const now = Date.now();

// ===== GET LAST LOCATION =====

const todayForLocation = new Date().toISOString().split("T")[0];
const lastPoint = await env.arm_db.prepare(`
SELECT lat,lng,timestamp
FROM location_history
WHERE emp_id = ?
AND DATE(datetime(timestamp/1000,'unixepoch')) = ?
ORDER BY timestamp DESC
LIMIT 1
`)
.bind(data.emp_id, todayForLocation)
.first();

let distance = 0;
let duration = 0;

if(lastPoint){

const R = 6371;

const lat1 = parseFloat(lastPoint.lat);
const lon1 = parseFloat(lastPoint.lng);

const lat2 = parseFloat(data.lat);
const lon2 = parseFloat(data.lng);

const dLat = (lat2-lat1)*Math.PI/180;
const dLon = (lon2-lon1)*Math.PI/180;

const a =
Math.sin(dLat/2)*Math.sin(dLat/2) +
Math.cos(lat1*Math.PI/180) *
Math.cos(lat2*Math.PI/180) *
Math.sin(dLon/2) *
Math.sin(dLon/2);

const c = 2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

distance = R*c;
duration = now - lastPoint.timestamp;

}

const locationTimestamp = (data.offline_sync && data.original_timestamp) 
    ? data.original_timestamp   // offline ka actual time
    : now;    
    // ✅ Offline ke liye original timestamp use karo
const eventTimestamp = (data.offline_sync && data.original_timestamp)
    ? parseInt(data.original_timestamp)
    : now;

// ✅ Duration bhi original timestamp se calculate karo
if(lastPoint && data.offline_sync && data.original_timestamp){
    duration = parseInt(data.original_timestamp) - lastPoint.timestamp;
    if(duration < 0) duration = 0; // Safety check
}                  // live data ka current time

await env.arm_db.prepare(
    `INSERT INTO location_history (emp_id, lat, lng, battery, timestamp)
     VALUES (?, ?, ?, ?, ?)`
).bind(
    data.emp_id,
    data.lat,
    data.lng,
    data.battery || 0,
    locationTimestamp  // ✅ sahi timestamp
).run();

// ===== PUNCH STATUS CHECK =====
const todayDate2 = new Date().toISOString().split("T")[0];

const activePunch2 = await env.arm_db.prepare(
    "SELECT id FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH IN' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate2).first();

const lastPunchOut2 = await env.arm_db.prepare(
    "SELECT id FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH OUT' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate2).first();

const isPunchedIn2 = activePunch2 && (!lastPunchOut2 || activePunch2.id > lastPunchOut2.id);

// ===== STOP DETECTION =====
// Check karo aaj travel hua hai ya nahi
const todayTravel = await env.arm_db.prepare(
    "SELECT id FROM timeline_events WHERE emp_id = ? AND event_type = 'TRAVEL' AND DATE(datetime(event_time/1000,'unixepoch')) = ? LIMIT 1"
).bind(data.emp_id, todayDate2).first();

if(isPunchedIn2 && distance < 0.03) {
    
    // पहले देखो employee कितने देर से एक जगह है
    const stationaryCheck = await env.arm_db.prepare(`
        SELECT 
            MIN(timestamp) as since,
            COUNT(*) as point_count
        FROM location_history
        WHERE emp_id = ?
        AND timestamp > ?
        AND ABS(CAST(lat AS REAL) - ?) < 0.0003
        AND ABS(CAST(lng AS REAL) - ?) < 0.0003
    `).bind(
        data.emp_id,
        now - 1800000, // पिछले 30 मिनट
        parseFloat(data.lat),
        parseFloat(data.lng)
    ).first();

    const stationaryDuration = stationaryCheck?.since 
        ? now - stationaryCheck.since 
        : 0;

    // 5 मिनट से ज्यादा एक जगह है?
    if(stationaryDuration > 300000) {
        
        // पिछले 30 मिनट में STOP बना है?
        const recentStop = await env.arm_db.prepare(
            "SELECT id FROM timeline_events WHERE emp_id = ? AND event_type = 'STOP' AND event_time > ?"
        ).bind(data.emp_id, now - 7200000).first();

        // TRAVEL हुआ है आज?
        const lastPunchInForStop = await env.arm_db.prepare(
    "SELECT timestamp FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH IN' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate2).first();

const lastPunchInTime = lastPunchInForStop ? Number(lastPunchInForStop.timestamp) : 0;

const todayTravelCheck = await env.arm_db.prepare(
    "SELECT id FROM timeline_events WHERE emp_id = ? AND event_type = 'TRAVEL' AND event_time > ? LIMIT 1"
).bind(data.emp_id, lastPunchInTime).first();

        if(!recentStop && todayTravelCheck) {
            const address = await getAddress(data.lat, data.lng);
            await env.arm_db.prepare(`
                INSERT INTO timeline_events 
                (emp_id, event_type, lat, lng, distance, duration, event_time, address, battery)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                data.emp_id,
                "STOP",
                data.lat,
                data.lng,
                0,
                stationaryDuration,
                now,
                address,
                data.battery || 0
            ).run();
            
            console.log(`⏸ STOP created for ${data.emp_id}: ${stationaryDuration/60000} min`);
        }
    }
}

// ===== SMART TRAVEL GROUP =====

const todayDate = new Date().toISOString().split("T")[0];


const activePunch = await env.arm_db.prepare(
    "SELECT id FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH IN' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate).first();

const lastPunchOut = await env.arm_db.prepare(
    "SELECT id FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH OUT' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate).first();

const isPunchedIn = activePunch && (!lastPunchOut || activePunch.id > lastPunchOut.id);

// last travel fetch
const lastTravel = await env.arm_db.prepare(`
SELECT id, event_time, distance 
FROM timeline_events
WHERE emp_id = ? AND event_type = 'TRAVEL'
AND DATE(datetime(event_time/1000,'unixepoch')) = ?
ORDER BY event_time DESC
LIMIT 1
`)
.bind(data.emp_id, todayDate)
.first();

     // ===== TRAVEL LOGIC - Sirf real movement =====
console.log("TRAVEL CHECK:", {
    isPunchedIn, 
    distance: distance.toFixed(4),
    lastTravelExists: !!lastTravel,
    timeSinceLastTravel: lastTravel ? (now - lastTravel.event_time)/1000 + 's' : 'no travel'
});


// Calculate once for the log (inline, no declaration)
console.log("TRAVEL:", { 
    distance: distance.toFixed(4), 
    speedKmPerMin: (duration > 0 ? (distance / (duration / 60000)) : 0).toFixed(4), 
    duration 
});

const lastPunchInRecord = await env.arm_db.prepare(
    "SELECT timestamp FROM attendance WHERE emp_id = ? AND work_date = ? AND type = 'PUNCH IN' ORDER BY id DESC LIMIT 1"
).bind(data.emp_id, todayDate).first();
const punchInTime = lastPunchInRecord ? Number(lastPunchInRecord.timestamp) : 0;
const timeSincePunchIn = now - punchInTime;

// Single declaration kept here
const speedKmPerMin = duration > 0 ? (distance / (duration / 60000)) : 0;

// ✅ Pehle check karo — naya travel banana hai ya purana update
// ✅ Offline ke liye eventTimestamp use karo comparison mein
const shouldInsertNew = !lastTravel || (eventTimestamp - lastTravel.event_time) > 1800000;

const isOffline = data.offline_sync === true;
if(isPunchedIn && distance >= 0.1 && distance < 0.5 && (isOffline || timeSincePunchIn >= 0)){
    if(shouldInsertNew){
        // ✅ Naya travel — distance se shuru karo
        const address = await getAddress(data.lat, data.lng);
        await env.arm_db.prepare(`
            INSERT INTO timeline_events
            (emp_id,event_type,lat,lng,distance,duration,event_time,address,battery)
            VALUES (?,?,?,?,?,?,?,?,?)
        `).bind(data.emp_id,"TRAVEL",data.lat,data.lng,
    parseFloat(distance.toFixed(4)),0,eventTimestamp,address,data.battery||0).run();
        // ✅ INSERT ho gaya — UPDATE mat karo is push pe
    } else {
    const isOfflineSync = data.offline_sync === true;
    if(distance >= 0.05 && distance < 0.5) {
        await env.arm_db.prepare(
                `UPDATE timeline_events SET distance = distance + ?, duration = ? - event_time WHERE id = ?`
).bind(parseFloat(distance.toFixed(4)), eventTimestamp, lastTravel.id).run();
        }
    }
} else if(isPunchedIn && distance >= 0.05 && distance < 0.5 &&
          !shouldInsertNew && lastTravel){
    if(distance >= 0.05) {
        await env.arm_db.prepare(
            `UPDATE timeline_events SET distance = distance + ?, duration = ? - event_time WHERE id = ?`
).bind(parseFloat(distance.toFixed(4)), eventTimestamp, lastTravel.id).run();
    }
}


await env.arm_db.prepare(
`INSERT INTO live_locations (emp_id, name, lat, lng, battery, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(emp_id) DO UPDATE SET
name = excluded.name,
lat = excluded.lat,
lng = excluded.lng,
battery = excluded.battery,
updated_at = excluded.updated_at`
)
.bind(
data.emp_id,
empName,
data.lat,
data.lng,
data.battery || 0,
now
)
.run();

return new Response(JSON.stringify({ status: "OK" }), {
headers: jsonHeaders,
});

} catch (e) {

return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});

}

}
// ================= LIVE MAP =================
if (url.pathname === "/api/live-map" && request.method === "GET") {
try {
const { results } = await env.arm_db.prepare(`
SELECT emp_id, name, lat, lng, battery, updated_at
FROM live_locations
ORDER BY updated_at DESC
`).all();

return new Response(JSON.stringify(results), {
headers: jsonHeaders,
});
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});
}
}

// ================= HISTORY ENDPOINT =================
if (url.pathname === "/api/history" && request.method === "GET") {
try {
const { results } = await env.arm_db
.prepare(`SELECT emp_id, (lat || ',' || lng) as location, battery, timestamp as time FROM location_history ORDER BY timestamp ASC`)
.all();

return new Response(JSON.stringify(results), {
headers: jsonHeaders,
});
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});
}
}

// ================= ROUTE =================
if (url.pathname === "/api/route" && request.method === "GET") {

try {

const empId = url.searchParams.get("emp_id");
const date = url.searchParams.get("date");

const { results } = await env.arm_db
.prepare(`
SELECT lat,lng,timestamp
FROM location_history
WHERE emp_id = ?
AND DATE(datetime(timestamp/1000,'unixepoch')) = ?
ORDER BY timestamp ASC
`)
.bind(empId, date)
.all();

return new Response(JSON.stringify(results), {
headers: jsonHeaders
});

} catch (e) {

return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders
});

}

}

// ================= EMPLOYEES CARD VIEW (JOIN Logic + Today's Tasks) =================
if (url.pathname === "/api/employees-card-view" && request.method === "GET") {
    try {
        const istOffset = 5.5 * 60 * 60 * 1000;
const today = new Date(Date.now() + istOffset).toISOString().split('T')[0];// आज की तारीख (YYYY-MM-DD)

        // 1. सभी कर्मचारियों का डेटा लाएं
        const { results: employees } = await env.arm_db.prepare(`
            SELECT 
                e.emp_id AS id, 
                e.name, 
                e.phone, 
                e.team,
                COALESCE(l.battery, a.battery, '0') AS battery,
                COALESCE(NULLIF(l.lat || ',' || l.lng, ','), a.location, 'Location N/A') AS location,
                CASE WHEN a.type = 'PUNCH IN' THEN 'in' ELSE 'out' END AS status,
                CASE WHEN a.type = 'PUNCH IN' THEN a.time ELSE NULL END AS punchIn,
                (SELECT time FROM attendance WHERE emp_id = e.emp_id AND type = 'PUNCH OUT' ORDER BY id DESC LIMIT 1) AS punchOut
            FROM employees e
            LEFT JOIN live_locations l ON e.emp_id = l.emp_id
            LEFT JOIN (
    SELECT emp_id, type, time, battery, location 
    FROM attendance AS a1
    WHERE a1.id = (
        SELECT MAX(a2.id) 
        FROM attendance AS a2 
        WHERE a2.emp_id = a1.emp_id
    )
) a ON e.emp_id = a.emp_id
            WHERE e.status != 'DELETED'
            ORDER BY e.name ASC
        `).all();

        // 2. आज के सभी टास्क एक साथ लाएं
        const { results: allTasks } = await env.arm_db.prepare(`
    SELECT emp_id, task_name, created_at, task_data, photo_url, address, latitude, longitude
    FROM tasks 
    WHERE DATE(datetime(created_at, '+5 hours', '30 minutes')) = ?
    ORDER BY created_at DESC
`).bind(today).all();

        // 3. कर्मचारियों के साथ उनके टास्क को मैप करें (Unolo Style Logic)
        const finalData = employees.map(emp => {
            return {
                ...emp,
                tasks: allTasks.filter(t => t.emp_id === emp.id) // उस एम्प्लॉई के टास्क जोड़ें
            };
        });

        return new Response(JSON.stringify(finalData), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}
// ================= EMPLOYEES =================
if (url.pathname === "/api/employees" && request.method === "GET") {
const { results } = await env.arm_db
.prepare("SELECT * FROM employees WHERE status != 'DELETED'")
.all();
return new Response(JSON.stringify(results), { headers: jsonHeaders });
}

if (url.pathname === "/api/add-employee" && request.method === "POST") {
const data = await request.json();
const newEmpId =
data.emp_id || "EMP" + Math.floor(1000 + Math.random() * 9000);


// 🔴 CHECK DUPLICATE EMP_ID OR EMAIL
const existing = await env.arm_db
.prepare("SELECT emp_id,email FROM employees WHERE emp_id = ? OR email = ?")
.bind(newEmpId, data.email)
.first();

if (existing) {
return new Response(
JSON.stringify({
status: "Fail",
message: "Employee with same ID or Email already exists"
}),
{ status: 400, headers: jsonHeaders }
);
}


await env.arm_db
.prepare(
`INSERT INTO employees (emp_id, name, phone, email, designation, team, status, created_at, doj)
VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
)
.bind(
newEmpId,
data.name,
data.phone,
data.email,
data.designation,
data.team || "NA",
Date.now(),
data.doj || ""
)
.run();

return new Response(
JSON.stringify({ status: "Success", emp_id: newEmpId }),
{ headers: jsonHeaders }
);
}

// ================= UPDATE / PAUSE / DELETE EMPLOYEE =================
if (url.pathname === "/api/update-employee" && request.method === "POST") {
try {
const data = await request.json();

// 🔴 CHECK DUPLICATE ON UPDATE
const existing = await env.arm_db
.prepare("SELECT emp_id FROM employees WHERE (emp_id = ? OR email = ?) AND emp_id != ?")
.bind(data.emp_id, data.email, data.old_emp_id)
.first();

if (existing) {
return new Response(
JSON.stringify({
status: "Fail",
message: "Another employee already uses this ID or Email"
}),
{ status: 400, headers: jsonHeaders }
);
}

await env.arm_db
.prepare(`
UPDATE employees SET
emp_id = ?,
name = ?,
phone = ?,
email = ?,
designation = ?,
team = ?,
status = ?,
doj = ?
WHERE emp_id = ?
`)
.bind(
data.emp_id,
data.name,
data.phone,
data.email,
data.designation,
data.team,
data.status,
data.doj,
data.old_emp_id
)
.run();

if (data.status === "DELETED") {
await env.arm_db
.prepare("DELETE FROM live_locations WHERE emp_id = ?")
.bind(data.old_emp_id)
.run();
}

return new Response(
JSON.stringify({ status: "Success" }),
{ headers: jsonHeaders }
);
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), {
status: 500,
headers: jsonHeaders,
});
}
}

// ================= 🔥 TEAMS MANAGEMENT LOGIC 🔥 =================

// 1. GET ALL TEAMS (Except Deleted)
if (url.pathname === "/api/teams" && request.method === "GET") {
try {
const { results } = await env.arm_db
.prepare("SELECT * FROM teams WHERE status != 'DELETED' ORDER BY created_at DESC")
.all();
return new Response(JSON.stringify(results), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// 2. ADD NEW TEAM
if (url.pathname === "/api/add-team" && request.method === "POST") {
try {
const data = await request.json();
await env.arm_db
.prepare("INSERT INTO teams (team_name, hq_location, status, created_at) VALUES (?, ?, 'ACTIVE', ?)")
.bind(data.team_name, data.hq_location || "N/A", Date.now())
.run();

return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// 3. UPDATE TEAM (Syncs with Employees table)
if (url.pathname === "/api/update-team" && request.method === "POST") {
try {
const data = await request.json();

await env.arm_db
.prepare("UPDATE teams SET team_name = ?, hq_location = ? WHERE team_name = ?")
.bind(data.new_team_name, data.new_hq, data.old_team_name)
.run();

await env.arm_db
.prepare("UPDATE employees SET team = ? WHERE team = ?")
.bind(data.new_team_name, data.old_team_name)
.run();

return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}
// ================= 🔥 TASK MASTER LOGIC 🔥 =================

if (url.pathname === "/api/tasks-list" && request.method === "GET") {
    try {
        const { results } = await env.arm_db.prepare("SELECT * FROM task_master ORDER BY id DESC").all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders }); }
}

if (url.pathname === "/api/add-task-master" && request.method === "POST") {
    try {
        const data = await request.json();
        await env.arm_db.prepare("INSERT INTO task_master (task_name, form_structure, created_at) VALUES (?, ?, ?)")
            .bind(data.task_name, data.form_structure, Date.now()).run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders }); }
}

if (url.pathname === "/api/update-task-master" && request.method === "POST") {
    try {
        const data = await request.json();
        await env.arm_db.prepare("UPDATE task_master SET task_name = ?, form_structure = ? WHERE id = ?")
            .bind(data.task_name, data.form_structure, data.id).run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders }); }
}

if (url.pathname === "/api/delete-task-master" && request.method === "DELETE") {
    try {
        const id = url.searchParams.get("id");
        await env.arm_db.prepare("DELETE FROM task_master WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders }); }
}

// 4. DELETE TEAM (Soft Delete & Logout All Employees)
if (url.pathname === "/api/delete-team" && request.method === "DELETE") {
try {
const team_name = url.searchParams.get("team_name");
await env.arm_db
.prepare("UPDATE teams SET status = 'DELETED' WHERE team_name = ?")
.bind(team_name)
.run();

await env.arm_db
.prepare("UPDATE employees SET status = 'DELETED' WHERE team = ?")
.bind(team_name)
.run();

await env.arm_db
.prepare("DELETE FROM live_locations WHERE emp_id IN (SELECT emp_id FROM employees WHERE team = ?)")
.bind(team_name)
.run();

return new Response(JSON.stringify({ status: "Success", message: "Team and Members Blocked" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// ================= 🔥 NEW: DESIGNATIONS MANAGEMENT LOGIC 🔥 =================

// 1. GET ALL DESIGNATIONS (Except Deleted)
if (url.pathname === "/api/designations" && request.method === "GET") {
try {
const { results } = await env.arm_db
.prepare("SELECT * FROM designations WHERE status != 'DELETED' ORDER BY created_at DESC")
.all();
return new Response(JSON.stringify(results), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// 2. ADD NEW DESIGNATION
if (url.pathname === "/api/add-designation" && request.method === "POST") {
try {
const data = await request.json();
const existing = await env.arm_db.prepare(
    "SELECT id, status FROM designations WHERE designation_name = ?"
).bind(data.designation_name).first();

if (existing) {
    if (existing.status === 'DELETED') {
        // ✅ DELETED है → ACTIVE करो
        await env.arm_db.prepare(
            "UPDATE designations SET status = 'ACTIVE', category = ? WHERE designation_name = ?"
        ).bind(data.category || "General", data.designation_name).run();
    } else {
        // ✅ Already ACTIVE है → Error दो
        return new Response(JSON.stringify({ 
            status: "Fail", 
            message: "Designation already exists!" 
        }), { status: 400, headers: jsonHeaders });
    }
} else {
    // ✅ नया बनाओ
    await env.arm_db.prepare(
        "INSERT INTO designations (designation_name, category, status, created_at) VALUES (?, ?, 'ACTIVE', ?)"
    ).bind(data.designation_name, data.category || "General", Date.now()).run();
}

return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// 3. UPDATE DESIGNATION (Syncs with Employees table)
if (url.pathname === "/api/update-designation" && request.method === "POST") {
try {
const data = await request.json();

// 🔥 A. Update in designations table
await env.arm_db
.prepare("UPDATE designations SET designation_name = ?, category = ? WHERE designation_name = ?")
.bind(data.new_name, data.new_category, data.old_name)
.run();

// 🔥 B. Update all associated employees (Soft Sync)
await env.arm_db
.prepare("UPDATE employees SET designation = ? WHERE designation = ?")
.bind(data.new_name, data.old_name)
.run();

return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// 4. DELETE DESIGNATION (Soft Delete & Block App for those roles)
if (url.pathname === "/api/delete-designation" && request.method === "DELETE") {
try {
const designation_name = url.searchParams.get("designation_name");
// A. Mark Designation as DELETED
await env.arm_db
.prepare("UPDATE designations SET status = 'DELETED' WHERE designation_name = ?")
.bind(designation_name)
.run();

// B. Mark all employees with this role as DELETED (Blocking App Access)
await env.arm_db
.prepare("UPDATE employees SET status = 'DELETED' WHERE designation = ?")
.bind(designation_name)
.run();

return new Response(JSON.stringify({ status: "Success", message: "Designation and Members Blocked" }), { headers: jsonHeaders });
} catch (e) {
return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
}
}

// ================= ROLES MANAGEMENT =================

// GET ALL ROLES
if (url.pathname === "/api/roles" && request.method === "GET") {
    try {
        const { results } = await env.arm_db
            .prepare("SELECT * FROM roles ORDER BY created_at DESC")
            .all();
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// CREATE NEW ROLE
if (url.pathname === "/api/roles" && request.method === "POST") {
    try {
        const data = await request.json();
        if (!data.role_name) {
            return new Response(JSON.stringify({ error: "Role name required" }), { status: 400, headers: jsonHeaders });
        }
        await env.arm_db
            .prepare("INSERT INTO roles (role_name, description, created_at) VALUES (?, ?, ?)")
            .bind(data.role_name, data.description || "", Date.now())
            .run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

// UPDATE ROLE
if (url.pathname.startsWith("/api/roles/") && request.method === "PUT") {
    try {
        const id = url.pathname.split("/api/roles/")[1];
        const data = await request.json();
        await env.arm_db
            .prepare("UPDATE roles SET role_name = ?, description = ? WHERE id = ?")
            .bind(data.role_name, data.description || "", id)
            .run();
        return new Response(JSON.stringify({ status: "Success" }), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}



// ================= MOBILE APP TASK FETCH (The Missing Link) =================
if (url.pathname === "/api/admin-tasks" && request.method === "GET") {
    try {
        // task_master टेबल से सारे एक्टिव टास्क उठाएं
        const { results } = await env.arm_db
            .prepare("SELECT id, task_name as taskName, form_structure as formStructure FROM task_master")
            .all();
            
        return new Response(JSON.stringify(results), { headers: jsonHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }
}

return new Response(JSON.stringify({ message: "ARM Force Backend Running" }), {
headers: jsonHeaders,
});
},

// ✅ यह नया scheduled add करो
async scheduled(event, env, ctx) {
    ctx.waitUntil(calculateAndSaveDailyDistances(env));
    ctx.waitUntil(handleInactiveEmployees(env));
    ctx.waitUntil(handleAutoPunchOut(env)); 
},
};

// ================= AUTO DAILY DISTANCE CALCULATOR =================
async function calculateAndSaveDailyDistances(env) {
    try {
        const istOffset = 5.5 * 60 * 60 * 1000;
        const today = new Date(Date.now() + istOffset).toISOString().split('T')[0];

        const { results: employees } = await env.arm_db.prepare(
            "SELECT emp_id, name FROM employees WHERE status = 'ACTIVE'"
        ).all();

        for (const emp of employees) {
            try {
                // ✅ location_history se GPS points — Track Trip jaisa
                const { results: points } = await env.arm_db.prepare(`
                    SELECT lat, lng, timestamp
                    FROM location_history
                    WHERE emp_id = ?
                    AND DATE(datetime(timestamp/1000,'unixepoch', '+5 hours', '30 minutes')) = ?
                    ORDER BY timestamp ASC
                `).bind(emp.emp_id, today).all();

                if (!points || points.length < 2) continue;

                // ✅ Noise filter — route-history jaisa
                const filtered = [];
                for (let i = 0; i < points.length; i++) {
                    if (i === 0) { filtered.push(points[i]); continue; }
                    const prev = filtered[filtered.length - 1];
                    const dist = calcDistAuto(
                        parseFloat(prev.lat), parseFloat(prev.lng),
                        parseFloat(points[i].lat), parseFloat(points[i].lng)
                    );
                    // 50m se zyada aur 50km se kam — valid movement
                    if (dist >= 0.05 && dist < 50) {
                        filtered.push(points[i]);
                    }
                }

                if (filtered.length < 2) continue;

                // ✅ Haversine distance — same formula jo route-history use karta hai
                let totalKm = 0;
                for (let i = 1; i < filtered.length; i++) {
                    const dist = calcDistAuto(
                        parseFloat(filtered[i-1].lat), parseFloat(filtered[i-1].lng),
                        parseFloat(filtered[i].lat), parseFloat(filtered[i].lng)
                    );
                    if (dist >= 0.01 && dist < 2) {
                        totalKm += dist;
                    }
                }

                totalKm = parseFloat(totalKm.toFixed(2));

                if (totalKm > 0) {
                    await env.arm_db.prepare(`
                        INSERT INTO daily_distance (emp_id, emp_name, work_date, total_km, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(emp_id, work_date)
                        DO UPDATE SET
                            total_km = excluded.total_km,
                            emp_name = excluded.emp_name,
                            updated_at = excluded.updated_at
                    `).bind(
                        emp.emp_id,
                        emp.name,
                        today,
                        totalKm,
                        Date.now()
                    ).run();

                    console.log(`✅ ${emp.name}: ${totalKm} Km`);
                }
            } catch(empErr) {
                console.error(`❌ Skip ${emp.emp_id}: ${empErr.message}`);
            }
        }
        console.log(`✅ Distance sync done for ${today}`);
    } catch(e) {
        console.error("❌ Distance calc error:", e);
    }
}

// Distance helper function
function calcDistAuto(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
        Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
        Math.sin(dLon/2)*Math.sin(dLon/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
// ================= AUTO INACTIVE EMPLOYEE HANDLER =================
async function handleInactiveEmployees(env) {
    try {
        const now = Date.now();
        const inactiveThreshold = 60 * 60 * 1000; // ✅ 1 घंटा

        const { results: liveEmps } = await env.arm_db.prepare(`
            SELECT emp_id, name, lat, lng, battery, updated_at
            FROM live_locations
            WHERE updated_at < ?
        `).bind(now - inactiveThreshold).all();

        for (const emp of liveEmps) {
            // ✅ सिर्फ Live Map से हटाओ
            // Punch Out मत करो — data वापस आने पर automatically resume होगा
            await env.arm_db.prepare(
                "DELETE FROM live_locations WHERE emp_id = ?"
            ).bind(emp.emp_id).run();

            console.log(`⚠️ Removed from live map (inactive 1hr): ${emp.name}`);
        }
    } catch(e) {
        console.error("❌ Inactive handler error:", e);
    }
}
// ================= AUTO PUNCH OUT (Daily 8 PM) =================
async function handleAutoPunchOut(env) {
    try {
        const now = new Date();
        const istHour = (now.getUTCHours() + 5) % 24;
        const istMinute = (now.getUTCMinutes() + 30) % 60;

        // ✅ Sirf raat 7 baje (19:00 IST) chalao
        if (istHour !== 19) return;

        const today = new Date().toISOString().split("T")[0];

        // ✅ Jin employees ne aaj punch in kiya hai unhe dhundho
        const { results: punchedInEmps } = await env.arm_db.prepare(`
            SELECT DISTINCT a.emp_id, e.name,
                l.lat, l.lng, l.battery
            FROM attendance a
            LEFT JOIN employees e ON a.emp_id = e.emp_id
            LEFT JOIN live_locations l ON a.emp_id = l.emp_id
            WHERE a.work_date = ?
            AND a.type = 'PUNCH IN'
            AND a.emp_id NOT IN (
                SELECT emp_id FROM attendance
                WHERE work_date = ?
                AND type = 'PUNCH OUT'
            )
        `).bind(today, today).all();

        if (!punchedInEmps || punchedInEmps.length === 0) {
            console.log("✅ Auto Punchout: Sab ne punchout kar diya");
            return;
        }

        const timestamp = Date.now();
        const workDate = new Date().toISOString().split("T")[0];
        const punchTime = new Date().toISOString();

        for (const emp of punchedInEmps) {
            try {
                const lat = emp.lat || "0.0";
                const lng = emp.lng || "0.0";
                const battery = emp.battery || 0;

                // ✅ Address fetch karo
                let address = "System Auto Punch Out";
                if (lat !== "0.0" && lng !== "0.0") {
                    try {
                        const geoRes = await fetch(
                            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCKPgb6poNgqg5mZLdj-oqowdEwXP4UB90`
                        );
                        const geoData = await geoRes.json();
                        if (geoData.results?.[0]) {
                            address = geoData.results[0].formatted_address;
                        }
                    } catch(e) {}
                }

                // ✅ Attendance mein PUNCH OUT save karo
                await env.arm_db.prepare(`
                    INSERT INTO attendance
                    (emp_id, name, type, time, location, timestamp, work_date, battery)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    emp.emp_id,
                    emp.name || "Unknown",
                    "PUNCH OUT",
                    punchTime,
                    `${lat},${lng}`,
                    timestamp,
                    workDate,
                    String(battery)
                ).run();

                // ✅ Timeline mein SYSTEM PUNCH OUT save karo
                await env.arm_db.prepare(`
                    INSERT INTO timeline_events
                    (emp_id, event_type, lat, lng, distance, duration, event_time, address, battery)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    emp.emp_id,
                    "PUNCH_OUT",
                    lat,
                    lng,
                    0,
                    0,
                    timestamp,
                    "🤖 System Punch Out — " + address,
                    battery
                ).run();

                // ✅ Live location se hatao
                await env.arm_db.prepare(
                    "DELETE FROM live_locations WHERE emp_id = ?"
                ).bind(emp.emp_id).run();

                console.log(`🤖 Auto PunchOut: ${emp.name} (${emp.emp_id})`);

            } catch(empErr) {
                console.error(`❌ Auto PunchOut failed for ${emp.emp_id}: ${empErr.message}`);
            }
        }

    } catch(e) {
        console.error("❌ Auto PunchOut Error:", e);
    }
}
