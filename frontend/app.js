const API_URL = "http://localhost:4000/api";
let deleteTimer;
let productosMemoria = [];
let miGrafico = null;

document.addEventListener("DOMContentLoaded", () => {
    // 1. Detectar qué página estamos visitando
    const esDashboard = document.getElementById("total-productos") || document.getElementById("total-productos-val");
    const esProductos = document.getElementById("lista-productos");
    const esInventario = document.getElementById("form-movimiento");
    const esLogin = document.getElementById("formLogin");

    // 2. Inicializar lógica según la página
    if (esLogin) {
        esLogin.addEventListener("submit", gestionarLogin);
    }

    if (esDashboard) {
        actualizarContadoresDashboard();
    }

    if (esProductos) {
        cargarProductos();
        const formProd = document.getElementById("form-producto");
        if (formProd) formProd.addEventListener("submit", gestionarEnvio);
    }

    if (esInventario) {
        // La función movimiento() se llama desde el HTML con onsubmit
    }
});

// --- LÓGICA DE PRODUCTOS (CRUD) ---
async function cargarProductos(idParaResaltar = null) {
    const tabla = document.getElementById("lista-productos");
    if (!tabla) return;

    try {
        const response = await fetch(`${API_URL}/productos`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        });
        productosMemoria = await response.json();
        
        renderizarTabla(idParaResaltar);
        
        // Solo actualizar gráfico si el canvas existe en el HTML
        if (document.getElementById('graficoStock')) {
            actualizarGrafico();
        }
    } catch (e) {
        mostrarToast("❌ Error al conectar con el servidor", "error");
    }
}

function renderizarTabla(idParaResaltar) {
    const tabla = document.getElementById("lista-productos");
    if (!tabla) return;
    tabla.innerHTML = "";
    
    productosMemoria.forEach(p => {
        const fila = document.createElement('tr');
        if (idParaResaltar && p.id_producto == idParaResaltar) fila.classList.add('row-highlight');

        fila.innerHTML = `
            <td>${p.id_producto}</td>
            <td>${p.nombre}</td>
            <td><span class="${p.stock < 5 ? 'badge-danger' : 'badge-success'}">${p.stock}</span></td>
            <td>$${parseFloat(p.precio).toFixed(2)}</td>
            <td>
                <button class="btn-edit" onclick="prepararEdicion(${p.id_producto}, '${p.nombre}', ${p.stock}, ${p.precio})">Editar</button>
                <button class="btn-delete-smart" onclick="handleSmartDelete(this, ${p.id_producto})">Eliminar</button>
            </td>
        `;
        tabla.appendChild(fila);
    });
}

// --- DASHBOARD: CONTADORES Y GRÁFICO ---
async function actualizarContadoresDashboard() {
    try {
        const response = await fetch(`${API_URL}/productos`, {
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        });
        const productos = await response.json();

        const totalProds = productos.length;
        const totalStock = productos.reduce((acc, p) => acc + parseInt(p.stock), 0);
        const valorTotal = productos.reduce((acc, p) => acc + (p.stock * p.precio), 0);
        const bajoStock = productos.filter(p => p.stock < 5).length;

        // Inyectar en index.html o dashboard.html (soporta ambos formatos de ID)
        const elTotal = document.getElementById("total-productos") || document.getElementById("total-productos-val");
        const elStock = document.getElementById("stock-total") || document.getElementById("stock-bajo-val");
        const elValor = document.getElementById("valor-inventario") || document.getElementById("valor-inventario-val");

        if (elTotal) elTotal.innerText = totalProds;
        if (elStock) elStock.innerText = (elStock.id === "stock-bajo-val") ? bajoStock : totalStock;
        if (elValor) elValor.innerText = `$${valorTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
    } catch (e) { console.error("Error en contadores", e); }
}

function actualizarGrafico() {
    const canvas = document.getElementById('graficoStock');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (miGrafico) miGrafico.destroy();

    const nombres = productosMemoria.slice(0, 5).map(p => p.nombre);
    const stocks = productosMemoria.slice(0, 5).map(p => p.stock);

    miGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Stock Actual',
                data: stocks,
                backgroundColor: stocks.map(s => s < 5 ? '#ef4444' : '#00d4ff'),
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// --- MOVIMIENTOS DE INVENTARIO (Entradas/Salidas) ---
async function movimiento() {
    const id = document.getElementById("producto").value;
    const tipo = document.getElementById("tipo").value;
    const cantidad = parseInt(document.getElementById("cantidad").value);

    try {
        const res = await fetch(`${API_URL}/productos/movimiento`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ id_producto: id, tipo, cantidad })
        });

        if (res.ok) {
            mostrarToast(`✅ ${tipo} registrada correctamente`, "success");
            document.getElementById("form-movimiento").reset();
        } else {
            const err = await res.json();
            mostrarToast(`❌ ${err.message || 'Error en movimiento'}`, "error");
        }
    } catch (e) { mostrarToast("❌ Error de conexión", "error"); }
}

// --- UTILIDADES (Buscador, Excel, Toasts) ---
function filtrarProductos() {
    const filtro = document.getElementById("busqueda").value.toLowerCase();
    const filas = document.querySelectorAll("#lista-productos tr");
    filas.forEach(f => {
        const nombre = f.cells[1].textContent.toLowerCase();
        f.style.display = nombre.includes(filtro) ? "" : "none";
    });
}

function exportarExcel() {
    if (productosMemoria.length === 0) return mostrarToast("No hay datos", "error");
    const worksheet = XLSX.utils.json_to_sheet(productosMemoria);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(workbook, "Reporte_Multitech.xlsx");
}

function mostrarToast(msg, tipo) {
    const t = document.getElementById("toast");
    if (!t) return alert(msg);
    t.innerHTML = `<span>${msg}</span>`;
    t.className = `toast-notificacion show ${tipo}`;
    setTimeout(() => t.classList.remove("show"), 3000);
}

async function gestionarLogin(e) {
    e.preventDefault();
    // 1. Obtenemos los valores de los inputs por su ID
    const correo = document.getElementById("correo").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // 2. IMPORTANTE: Aquí enviamos "correo" en lugar de "email"
            // Ajusta "password" a "clave" si tu backend usa ese nombre
            body: JSON.stringify({ correo, password }) 
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("token", data.token);
            window.location.href = "index.html";
        } else {
            // El servidor respondió con 401, 400, etc.
            mostrarToast(data.message || "Credenciales incorrectas", "error");
        }
    } catch (e) {
        mostrarToast("Error al conectar con el servidor", "error");
    }
}

function logout() {
    localStorage.removeItem("token");
    window.location.href = "login.html";
}

// Alias para el botón de cerrar sesión en productos.html
function cerrarSesion() { logout(); }

// --- FUNCIONES CRUD ADICIONALES ---
function prepararEdicion(id, nombre, stock, precio) {
    document.getElementById("id-producto").value = id;
    document.getElementById("nombre").value = nombre;
    document.getElementById("stock").value = stock;
    document.getElementById("precio").value = precio;
    document.getElementById("btn-guardar").innerText = "Actualizar Producto";
    document.querySelector(".glass-card").scrollIntoView({ behavior: 'smooth' });
}

function handleSmartDelete(button, id) {
    if (!button.classList.contains('confirming')) {
        button.classList.add('confirming');
        button.innerText = '¿Seguro?';
        deleteTimer = setTimeout(() => {
            button.classList.remove('confirming');
            button.innerText = 'Eliminar';
        }, 3000);
    } else {
        ejecutarBorrado(id);
    }
}

async function ejecutarBorrado(id) {
    const res = await fetch(`${API_URL}/productos/${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });
    if (res.ok) {
        mostrarToast("🗑️ Producto eliminado", "success");
        cargarProductos();
    }
}

async function gestionarEnvio(e) {
    e.preventDefault();
    const id = document.getElementById("id-producto").value;
    const datos = {
        nombre: document.getElementById("nombre").value.trim(),
        stock: parseInt(document.getElementById("stock").value),
        precio: parseFloat(document.getElementById("precio").value)
    };

    const res = await fetch(id ? `${API_URL}/productos/${id}` : `${API_URL}/productos`, {
        method: id ? "PUT" : "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(datos)
    });

    if (res.ok) {
        mostrarToast("✅ Guardado correctamente", "success");
        document.getElementById("form-producto").reset();
        document.getElementById("id-producto").value = "";
        document.getElementById("btn-guardar").innerText = "Guardar Producto";
        cargarProductos();
    }
}