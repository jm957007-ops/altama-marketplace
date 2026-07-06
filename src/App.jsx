import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const ME_KEY = "marketplace-zc-mi-identidad";
const CART_KEY = "marketplace-zc-carrito";
const ADMIN_PASSWORD = "zonaconurbada2026";
const CUOTA_MENSUAL = 150; // MXN — cámbialo según lo que decidas cobrar
const DIAS_VIGENCIA = 30;
const COSTO_ENVIO = 70; // MXN
const MAX_IMAGENES = 5;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function diasRestantes(ultimoPago) {
  if (!ultimoPago) return -Infinity;
  const vencimiento = new Date(ultimoPago);
  vencimiento.setDate(vencimiento.getDate() + DIAS_VIGENCIA);
  const diff = Math.ceil((vencimiento - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}
function reputacion(ventas) {
  const v = ventas || 0;
  if (v >= 50) return { label: "Top vendedor", emoji: "🏆" };
  if (v >= 10) return { label: "Vendedor confiable", emoji: "⭐" };
  if (v >= 1) return { label: "Vendedor activo", emoji: "✓" };
  return { label: "Nuevo", emoji: "🆕" };
}

const CIUDADES = ["Tampico", "Ciudad Madero", "Altamira"];
const CATEGORIAS = ["Electrónica", "Hogar", "Moda", "Vehículos", "Servicios", "Otros"];

const GREEN = "#1FA6A0"; // turquesa costero — color principal de marca
const GOLD = "#E2603F"; // coral — acentos de energía
const RED = "#C24444";
const INK = "#123A3D"; // tinta petróleo
const DIM = "#6B8482";
const BORDER = "#DCEAE8";
const BG = "#F6EFE3"; // arena cálida

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-MX")} MXN`;
}
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function waLink(phone, text) {
  const clean = (phone || "").replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function comprimirImagen(file, maxWidth = 700, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function MarketplaceZonaConurbada() {
  const [loaded, setLoaded] = useState(false);
  const [vendedores, setVendedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [identidad, setIdentidad] = useState({ tipo: "comprador" });
  const [carrito, setCarrito] = useState([]);
  const [tab, setTab] = useState("comprar");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [entregaPorVendedor, setEntregaPorVendedor] = useState({});

  // ids presentes en Firestore, para saber qué borrar al sincronizar
  const idsFirestore = useRef({ vendedores: new Set(), productos: new Set() });

  // filtros comprador
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");

  // registro vendedor
  const [showRegistroVendedor, setShowRegistroVendedor] = useState(false);
  const [nuevoVendedor, setNuevoVendedor] = useState({ nombre: "", whatsapp: "", ciudad: CIUDADES[0] });

  // form producto
  const [productoForm, setProductoForm] = useState(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  // admin
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [toast, setToast] = useState(null);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");

  const showToast = useCallback((mensaje) => {
    setToast(mensaje);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- Carga en tiempo real desde Firestore ----
  useEffect(() => {
    const unsubV = onSnapshot(
      collection(db, "altama_vendedores"),
      (snap) => {
        idsFirestore.current.vendedores = new Set(snap.docs.map((d) => d.id));
        setVendedores(snap.docs.map((d) => d.data()));
      },
      () => setError("No se pudo conectar a la base de datos.")
    );
    const unsubP = onSnapshot(
      collection(db, "altama_productos"),
      (snap) => {
        idsFirestore.current.productos = new Set(snap.docs.map((d) => d.id));
        setProductos(snap.docs.map((d) => d.data()));
        setLoaded(true);
      },
      () => {
        setError("No se pudo conectar a la base de datos.");
        setLoaded(true);
      }
    );
    try {
      const me = localStorage.getItem(ME_KEY);
      if (me) setIdentidad(JSON.parse(me));
      const cart = localStorage.getItem(CART_KEY);
      if (cart) setCarrito(JSON.parse(cart));
    } catch (e) {}
    return () => {
      unsubV();
      unsubP();
    };
  }, []);

  // ---- Guardar en Firestore (escribe todo y borra lo que ya no existe) ----
  const persist = useCallback(async (nextVendedores, nextProductos) => {
    setSaving(true);
    try {
      const vIds = new Set(nextVendedores.map((v) => v.id));
      const pIds = new Set(nextProductos.map((p) => p.id));
      const ops = [];
      nextVendedores.forEach((v) => ops.push(setDoc(doc(db, "altama_vendedores", v.id), v)));
      nextProductos.forEach((p) => ops.push(setDoc(doc(db, "altama_productos", p.id), p)));
      idsFirestore.current.vendedores.forEach((id) => {
        if (!vIds.has(id)) ops.push(deleteDoc(doc(db, "altama_vendedores", id)));
      });
      idsFirestore.current.productos.forEach((id) => {
        if (!pIds.has(id)) ops.push(deleteDoc(doc(db, "altama_productos", id)));
      });
      await Promise.all(ops);
    } catch (e) {
      setError("No se pudo guardar. Intenta de nuevo.");
    }
    setSaving(false);
  }, []);

  const persistIdentidad = useCallback(async (next) => {
    setIdentidad(next);
    try {
      localStorage.setItem(ME_KEY, JSON.stringify(next));
    } catch (e) {}
  }, []);

  const persistCarrito = useCallback(async (next) => {
    setCarrito(next);
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(next));
    } catch (e) {}
  }, []);

  const miVendedor = useMemo(
    () => vendedores.find((v) => v.id === identidad.vendedorId),
    [vendedores, identidad]
  );

  const misProductos = useMemo(
    () => (miVendedor ? productos.filter((p) => p.vendedorId === miVendedor.id) : []),
    [productos, miVendedor]
  );

  const vendedorById = useMemo(() => {
    const map = {};
    vendedores.forEach((v) => (map[v.id] = v));
    return map;
  }, [vendedores]);

  const productosVisibles = useMemo(() => {
    return productos.filter((p) => {
      if (!p.activo) return false;
      const vendedor = vendedorById[p.vendedorId];
      if (!vendedor || vendedor.activo === false) return false;
      if (filtroCategoria && p.categoria !== filtroCategoria) return false;
      if (filtroCiudad && p.ciudad !== filtroCiudad) return false;
      if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [productos, vendedorById, filtroCategoria, filtroCiudad, busqueda]);

  const cartCount = carrito.reduce((sum, c) => sum + c.cantidad, 0);

  const carritoDetallado = useMemo(() => {
    return carrito
      .map((c) => {
        const producto = productos.find((p) => p.id === c.productoId);
        if (!producto) return null;
        return { ...c, producto };
      })
      .filter(Boolean);
  }, [carrito, productos]);

  const carritoPorVendedor = useMemo(() => {
    const groups = {};
    carritoDetallado.forEach((item) => {
      const vId = item.producto.vendedorId;
      if (!groups[vId]) groups[vId] = [];
      groups[vId].push(item);
    });
    return groups;
  }, [carritoDetallado]);

  const carritoTotal =
    carritoDetallado.reduce((sum, item) => sum + item.producto.precio * item.cantidad, 0) +
    Object.keys(carritoPorVendedor).reduce(
      (sum, vId) => sum + (entregaPorVendedor[vId] === "domicilio" ? COSTO_ENVIO : 0),
      0
    );

  function elegirEntrega(vendedorId, tipo) {
    setEntregaPorVendedor((prev) => ({ ...prev, [vendedorId]: tipo }));
  }

  // ---- registro / login vendedor ----
  function registrarVendedor() {
    const nombre = nuevoVendedor.nombre.trim();
    const whatsapp = nuevoVendedor.whatsapp.trim();
    if (!nombre || !whatsapp) {
      setError("Completa el nombre de tu tienda y tu WhatsApp.");
      return;
    }
    const id = uid();
    const vendedor = {
      id,
      nombre,
      whatsapp,
      ciudad: nuevoVendedor.ciudad,
      activo: true,
      ultimoPago: hoyISO(),
      ventas: 0,
    };
    const nextVendedores = [...vendedores, vendedor];
    setVendedores(nextVendedores);
    persist(nextVendedores, productos);
    persistIdentidad({ tipo: "vendedor", vendedorId: id, nombre });
    setShowRegistroVendedor(false);
    setNuevoVendedor({ nombre: "", whatsapp: "", ciudad: CIUDADES[0] });
    setError("");
    setTab("vender");
    showToast(`✓ Tienda creada — sesión iniciada como ${nombre}`);
  }

  function cerrarSesionVendedor() {
    persistIdentidad({ tipo: "comprador" });
    setTab("comprar");
    showToast("Sesión de vendedor cerrada");
  }

  // ---- productos ----
  function abrirNuevoProducto() {
    setProductoForm({
      nombre: "",
      precio: "",
      categoria: CATEGORIAS[0],
      ciudad: miVendedor?.ciudad || CIUDADES[0],
      imagenes: [],
      stock: "",
    });
  }

  function abrirEditarProducto(p) {
    setProductoForm({ ...p, imagenes: p.imagenes || (p.imagen ? [p.imagen] : []) });
  }

  async function handleImagenFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSubiendoImagen(true);
    setError("");
    try {
      const espacioDisponible = MAX_IMAGENES - (productoForm.imagenes?.length || 0);
      const aProcesar = files.slice(0, Math.max(espacioDisponible, 0));
      const nuevas = [];
      for (const file of aProcesar) {
        const base64 = await comprimirImagen(file);
        nuevas.push(base64);
      }
      setProductoForm((f) => ({ ...f, imagenes: [...(f.imagenes || []), ...nuevas] }));
    } catch (err) {
      setError("No se pudo procesar alguna foto. Intenta de nuevo.");
    }
    setSubiendoImagen(false);
    e.target.value = "";
  }

  function quitarImagenForm(idx) {
    setProductoForm((f) => ({ ...f, imagenes: f.imagenes.filter((_, i) => i !== idx) }));
  }

  function guardarProducto() {
    if (!miVendedor) return;
    const f = productoForm;
    if (!f.nombre.trim() || !f.precio) {
      setError("Nombre y precio son obligatorios.");
      return;
    }
    let nextProductos;
    if (f.id) {
      nextProductos = productos.map((p) =>
        p.id === f.id ? { ...f, precio: Number(f.precio), stock: Number(f.stock) || 0 } : p
      );
    } else {
      const nuevo = {
        id: uid(),
        vendedorId: miVendedor.id,
        nombre: f.nombre.trim(),
        precio: Number(f.precio),
        categoria: f.categoria,
        ciudad: f.ciudad,
        imagenes: f.imagenes || [],
        stock: Number(f.stock) || 0,
        activo: true,
        vendidos: 0,
      };
      nextProductos = [...productos, nuevo];
    }
    setProductos(nextProductos);
    persist(vendedores, nextProductos);
    setProductoForm(null);
    setError("");
    showToast("✓ Producto guardado");
  }

  function eliminarProducto(id) {
    const next = productos.filter((p) => p.id !== id);
    setProductos(next);
    persist(vendedores, next);
  }

  function toggleActivoProducto(id) {
    const next = productos.map((p) => (p.id === id ? { ...p, activo: !p.activo } : p));
    setProductos(next);
    persist(vendedores, next);
  }

  function marcarVentaProducto(producto) {
    if (!miVendedor) return;
    const nextProductos = productos.map((p) =>
      p.id === producto.id ? { ...p, vendidos: (p.vendidos || 0) + 1 } : p
    );
    const nextVendedores = vendedores.map((v) =>
      v.id === miVendedor.id ? { ...v, ventas: (v.ventas || 0) + 1 } : v
    );
    setProductos(nextProductos);
    setVendedores(nextVendedores);
    persist(nextVendedores, nextProductos);
    showToast("✓ Venta registrada");
  }

  // ---- carrito ----
  function agregarAlCarrito(producto) {
    const existing = carrito.find((c) => c.productoId === producto.id);
    let next;
    if (existing) {
      next = carrito.map((c) =>
        c.productoId === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c
      );
    } else {
      next = [...carrito, { productoId: producto.id, cantidad: 1 }];
    }
    persistCarrito(next);
    setCartOpen(true);
  }

  function cambiarCantidad(productoId, delta) {
    const next = carrito
      .map((c) => (c.productoId === productoId ? { ...c, cantidad: c.cantidad + delta } : c))
      .filter((c) => c.cantidad > 0);
    persistCarrito(next);
  }

  function quitarDelCarrito(productoId) {
    persistCarrito(carrito.filter((c) => c.productoId !== productoId));
  }

  function checkoutPorVendedor(vendedorId) {
    const vendedor = vendedorById[vendedorId];
    const items = carritoPorVendedor[vendedorId] || [];
    if (!vendedor || items.length === 0) return;
    const tipoEntrega = entregaPorVendedor[vendedorId] || "recoger";
    const lineas = items.map(
      (item) => `• ${item.cantidad}x ${item.producto.nombre} — ${money(item.producto.precio * item.cantidad)}`
    );
    const subtotal = items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
    const envio = tipoEntrega === "domicilio" ? COSTO_ENVIO : 0;
    const total = subtotal + envio;
    const entregaTexto =
      tipoEntrega === "domicilio"
        ? `🚚 Envío a domicilio (+${money(COSTO_ENVIO)})`
        : `🏠 Recoger en tienda (gratis)`;
    const mensaje = `Hola ${vendedor.nombre}, quiero pedir:\n\n${lineas.join("\n")}\n\nEntrega: ${entregaTexto}\nSubtotal: ${money(subtotal)}\nTotal: ${money(total)}\n\n(Pedido desde Libre Mercado Ventas)`;
    window.open(waLink(vendedor.whatsapp, mensaje), "_blank");
  }

  // ---- admin ----
  function tryAdminLogin() {
    if (adminInput === ADMIN_PASSWORD) {
      persistIdentidad({ tipo: "admin" });
      setShowAdminLogin(false);
      setAdminInput("");
      setAdminError("");
      setTab("admin");
      showToast("🔑 Sesión de administrador iniciada");
    } else {
      setAdminError("Contraseña incorrecta.");
    }
  }

  function adminLogout() {
    persistIdentidad({ tipo: "comprador" });
    setTab("comprar");
    showToast("Sesión de administrador cerrada");
  }

  function adminEliminarVendedor(vendedorId) {
    const nextVendedores = vendedores.filter((v) => v.id !== vendedorId);
    const nextProductos = productos.filter((p) => p.vendedorId !== vendedorId);
    setVendedores(nextVendedores);
    setProductos(nextProductos);
    persist(nextVendedores, nextProductos);
  }

  function adminMarcarPago(vendedorId) {
    const next = vendedores.map((v) =>
      v.id === vendedorId ? { ...v, ultimoPago: hoyISO(), activo: true } : v
    );
    setVendedores(next);
    persist(next, productos);
    showToast("✓ Pago registrado (+30 días)");
  }

  function adminToggleActivoVendedor(vendedorId) {
    const next = vendedores.map((v) => (v.id === vendedorId ? { ...v, activo: !v.activo } : v));
    setVendedores(next);
    persist(next, productos);
  }

  if (!loaded) {
    return (
      <div style={styles.loadingScreen}>
        <div>Cargando marketplace…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        button { font-family: inherit; cursor: pointer; }
        input, select { font-family: inherit; }
        .prod-card:hover { box-shadow: 0 6px 20px rgba(20,30,50,0.10); transform: translateY(-2px); }
        ::placeholder { color: #A69C8A; }
        @keyframes floatCartIn {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastIn {
          from { transform: translate(-50%, -12px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>

      {toast && <div style={styles.toast}>{toast}</div>}
      {saving && <div style={styles.savingBadge}>Guardando…</div>}

      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <div style={styles.eyebrow}>libremercadoventas.com</div>
            <h1 style={styles.title}>Libre Mercado Ventas · Tampico, Madero y Altamira</h1>
          </div>
          <button style={styles.cartBtn} onClick={() => setCartOpen(true)}>
            🛒 {cartCount > 0 && <span style={styles.cartBadge}>{cartCount}</span>}
          </button>
        </div>

        <nav style={styles.nav}>
          <button
            onClick={() => setTab("comprar")}
            style={{ ...styles.navBtn, ...(tab === "comprar" ? styles.navBtnActive : {}) }}
          >
            Comprar
          </button>
          <button
            onClick={() => {
              if (miVendedor) setTab("vender");
              else setShowRegistroVendedor(true);
            }}
            style={{ ...styles.navBtn, ...(tab === "vender" ? styles.navBtnActive : {}) }}
          >
            {miVendedor ? "Mi tienda" : "Vender"}
          </button>
          <button
            onClick={() => {
              if (identidad.tipo === "admin") setTab("admin");
              else setShowAdminLogin(true);
            }}
            style={{ ...styles.navBtn, ...(tab === "admin" ? styles.navBtnActive : {}) }}
          >
            Admin
          </button>
        </nav>
      </header>

      {error && (
        <div style={styles.errorBanner} onClick={() => setError("")}>
          {error} <span style={{ opacity: 0.6, fontSize: 12 }}>(toca para cerrar)</span>
        </div>
      )}

      {/* ---------- TAB COMPRAR ---------- */}
      {tab === "comprar" && (
        <section>
          <div style={styles.filters}>
            <input
              style={styles.searchInput}
              placeholder="Buscar productos…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <select style={styles.select} value={filtroCiudad} onChange={(e) => setFiltroCiudad(e.target.value)}>
              <option value="">Todas las ciudades</option>
              {CIUDADES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select style={styles.select} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {productosVisibles.length === 0 ? (
            <div style={styles.emptyState}>
              Todavía no hay productos {busqueda || filtroCategoria || filtroCiudad ? "que coincidan con tu búsqueda" : "publicados"}.
            </div>
          ) : (
            <div style={styles.grid}>
              {productosVisibles.map((p) => {
                const imgs = p.imagenes || (p.imagen ? [p.imagen] : []);
                const vendedor = vendedorById[p.vendedorId];
                const rep = reputacion(vendedor?.ventas);
                return (
                  <div key={p.id} className="prod-card" style={styles.card}>
                    <div
                      style={{ ...styles.cardImageWrap, cursor: imgs.length ? "zoom-in" : "default" }}
                      onClick={() => imgs.length && setLightbox({ imagenes: imgs, index: 0 })}
                    >
                      {imgs.length ? (
                        <>
                          <img src={imgs[0]} alt={p.nombre} style={styles.cardImage} />
                          {imgs.length > 1 && <span style={styles.cardImageCount}>📷 {imgs.length}</span>}
                        </>
                      ) : (
                        <div style={styles.cardImagePlaceholder}>📦</div>
                      )}
                    </div>
                    <div style={styles.cardBody}>
                      <div style={styles.cardCategoria}>{p.categoria} · {p.ciudad}</div>
                      <div style={styles.cardNombre}>{p.nombre}</div>
                      <div style={styles.cardPrecio}>{money(p.precio)}</div>
                      {vendedor && (
                        <div style={styles.cardVendedor}>
                          {rep.emoji} {vendedor.nombre} · {rep.label}
                        </div>
                      )}
                      <button style={styles.btnPrimario} onClick={() => agregarAlCarrito(p)}>
                        Agregar al carrito
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------- TAB VENDER (MI TIENDA) ---------- */}
      {tab === "vender" && miVendedor && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h2 style={styles.panelTitle}>🏪 {miVendedor.nombre}</h2>
              <div style={styles.panelSub}>
                {miVendedor.ciudad} · WhatsApp {miVendedor.whatsapp} · {reputacion(miVendedor.ventas).emoji}{" "}
                {reputacion(miVendedor.ventas).label} ({miVendedor.ventas || 0} ventas)
              </div>
            </div>
            <button style={styles.btnLink} onClick={cerrarSesionVendedor}>Cerrar sesión</button>
          </div>

          {(() => {
            const dias = diasRestantes(miVendedor.ultimoPago);
            if (dias <= 0)
              return (
                <div style={styles.avisoRojo}>
                  ⚠️ Tu membresía venció. Contacta al administrador para renovar ({money(CUOTA_MENSUAL)}/mes) y
                  mantener tus productos visibles.
                </div>
              );
            if (dias <= 5)
              return (
                <div style={styles.avisoAmarillo}>
                  ⏳ Tu membresía vence en {dias} día{dias === 1 ? "" : "s"}. Renueva a tiempo para no perder
                  visibilidad.
                </div>
              );
            return (
              <div style={styles.avisoVerde}>✓ Membresía activa — {dias} días restantes.</div>
            );
          })()}

          <button style={{ ...styles.btnPrimario, maxWidth: 260 }} onClick={abrirNuevoProducto}>
            + Publicar producto
          </button>

          {misProductos.length === 0 ? (
            <div style={styles.emptyState}>Aún no has publicado productos. ¡Publica el primero!</div>
          ) : (
            <div style={styles.listado}>
              {misProductos.map((p) => {
                const imgs = p.imagenes || [];
                return (
                  <div key={p.id} style={styles.filaProducto}>
                    <div style={styles.filaThumb}>
                      {imgs.length ? <img src={imgs[0]} alt="" style={styles.filaThumbImg} /> : "📦"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.filaNombre}>
                        {p.nombre} {!p.activo && <span style={styles.tagPausado}>Pausado</span>}
                      </div>
                      <div style={styles.filaDetalle}>
                        {money(p.precio)} · Stock: {p.stock || 0} · Vendidos: {p.vendidos || 0}
                      </div>
                    </div>
                    <div style={styles.filaAcciones}>
                      <button style={styles.btnMini} onClick={() => marcarVentaProducto(p)}>+1 venta</button>
                      <button style={styles.btnMini} onClick={() => abrirEditarProducto(p)}>Editar</button>
                      <button style={styles.btnMini} onClick={() => toggleActivoProducto(p.id)}>
                        {p.activo ? "Pausar" : "Activar"}
                      </button>
                      <button
                        style={{ ...styles.btnMini, color: RED }}
                        onClick={() => window.confirm("¿Eliminar este producto?") && eliminarProducto(p.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------- TAB ADMIN ---------- */}
      {tab === "admin" && identidad.tipo === "admin" && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>🔑 Panel de administración</h2>
            <button style={styles.btnLink} onClick={adminLogout}>Salir</button>
          </div>

          <div style={styles.statsRow}>
            <div style={styles.statBox}>
              <div style={styles.statNum}>{vendedores.length}</div>
              <div style={styles.statLabel}>Vendedores</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statNum}>{productos.length}</div>
              <div style={styles.statLabel}>Productos</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statNum}>
                {money(vendedores.filter((v) => diasRestantes(v.ultimoPago) > 0).length * CUOTA_MENSUAL)}
              </div>
              <div style={styles.statLabel}>Ingreso mensual activo</div>
            </div>
          </div>

          <h3 style={styles.subTitle}>Vendedores</h3>
          {vendedores.length === 0 ? (
            <div style={styles.emptyState}>Sin vendedores registrados.</div>
          ) : (
            <div style={styles.listado}>
              {vendedores.map((v) => {
                const dias = diasRestantes(v.ultimoPago);
                return (
                  <div key={v.id} style={styles.filaProducto}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.filaNombre}>
                        {v.nombre} {v.activo === false && <span style={styles.tagPausado}>Suspendido</span>}
                      </div>
                      <div style={styles.filaDetalle}>
                        {v.ciudad} · WA {v.whatsapp} · Ventas: {v.ventas || 0} ·{" "}
                        {dias > 0 ? `Vigente ${dias}d` : "VENCIDO"}
                      </div>
                    </div>
                    <div style={styles.filaAcciones}>
                      <button style={styles.btnMini} onClick={() => adminMarcarPago(v.id)}>💰 Pago</button>
                      <button style={styles.btnMini} onClick={() => adminToggleActivoVendedor(v.id)}>
                        {v.activo === false ? "Activar" : "Suspender"}
                      </button>
                      <button
                        style={{ ...styles.btnMini, color: RED }}
                        onClick={() =>
                          window.confirm("¿Eliminar vendedor y todos sus productos?") &&
                          adminEliminarVendedor(v.id)
                        }
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h3 style={styles.subTitle}>Productos</h3>
          {productos.length === 0 ? (
            <div style={styles.emptyState}>Sin productos publicados.</div>
          ) : (
            <div style={styles.listado}>
              {productos.map((p) => (
                <div key={p.id} style={styles.filaProducto}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.filaNombre}>{p.nombre}</div>
                    <div style={styles.filaDetalle}>
                      {money(p.precio)} · {vendedorById[p.vendedorId]?.nombre || "—"}
                    </div>
                  </div>
                  <button
                    style={{ ...styles.btnMini, color: RED }}
                    onClick={() => window.confirm("¿Eliminar este producto?") && eliminarProducto(p.id)}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- MODAL REGISTRO VENDEDOR ---------- */}
      {showRegistroVendedor && (
        <div style={styles.overlay} onClick={() => setShowRegistroVendedor(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Crea tu tienda</h3>
            <p style={styles.modalSub}>
              Publica tus productos y recibe pedidos directo por WhatsApp. Primer mes de prueba incluido;
              después {money(CUOTA_MENSUAL)}/mes.
            </p>
            <input
              style={styles.input}
              placeholder="Nombre de tu tienda o negocio"
              value={nuevoVendedor.nombre}
              onChange={(e) => setNuevoVendedor({ ...nuevoVendedor, nombre: e.target.value })}
            />
            <input
              style={styles.input}
              placeholder="WhatsApp (10 dígitos)"
              value={nuevoVendedor.whatsapp}
              onChange={(e) => setNuevoVendedor({ ...nuevoVendedor, whatsapp: e.target.value })}
            />
            <select
              style={styles.input}
              value={nuevoVendedor.ciudad}
              onChange={(e) => setNuevoVendedor({ ...nuevoVendedor, ciudad: e.target.value })}
            >
              {CIUDADES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button style={styles.btnPrimario} onClick={registrarVendedor}>Crear mi tienda</button>
            <button style={styles.btnLink} onClick={() => setShowRegistroVendedor(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---------- MODAL LOGIN ADMIN ---------- */}
      {showAdminLogin && (
        <div style={styles.overlay} onClick={() => setShowAdminLogin(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Acceso administrador</h3>
            <input
              style={styles.input}
              type="password"
              placeholder="Contraseña"
              value={adminInput}
              onChange={(e) => setAdminInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
            />
            {adminError && <div style={{ color: RED, fontSize: 13, marginBottom: 8 }}>{adminError}</div>}
            <button style={styles.btnPrimario} onClick={tryAdminLogin}>Entrar</button>
            <button style={styles.btnLink} onClick={() => setShowAdminLogin(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---------- MODAL FORM PRODUCTO ---------- */}
      {productoForm && (
        <div style={styles.overlay} onClick={() => setProductoForm(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{productoForm.id ? "Editar producto" : "Publicar producto"}</h3>
            <input
              style={styles.input}
              placeholder="Nombre del producto"
              value={productoForm.nombre}
              onChange={(e) => setProductoForm({ ...productoForm, nombre: e.target.value })}
            />
            <input
              style={styles.input}
              type="number"
              placeholder="Precio (MXN)"
              value={productoForm.precio}
              onChange={(e) => setProductoForm({ ...productoForm, precio: e.target.value })}
            />
            <input
              style={styles.input}
              type="number"
              placeholder="Stock disponible"
              value={productoForm.stock}
              onChange={(e) => setProductoForm({ ...productoForm, stock: e.target.value })}
            />
            <select
              style={styles.input}
              value={productoForm.categoria}
              onChange={(e) => setProductoForm({ ...productoForm, categoria: e.target.value })}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              style={styles.input}
              value={productoForm.ciudad}
              onChange={(e) => setProductoForm({ ...productoForm, ciudad: e.target.value })}
            >
              {CIUDADES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label style={styles.uploadBtn}>
              {subiendoImagen ? "Procesando fotos…" : `📷 Agregar fotos (${(productoForm.imagenes || []).length}/${MAX_IMAGENES})`}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleImagenFiles}
                disabled={subiendoImagen || (productoForm.imagenes || []).length >= MAX_IMAGENES}
              />
            </label>

            {(productoForm.imagenes || []).length > 0 && (
              <div style={styles.thumbRow}>
                {productoForm.imagenes.map((img, idx) => (
                  <div key={idx} style={styles.thumbWrap}>
                    <img src={img} alt="" style={styles.thumbImg} />
                    <button style={styles.thumbX} onClick={() => quitarImagenForm(idx)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <button style={styles.btnPrimario} onClick={guardarProducto} disabled={subiendoImagen}>
              {productoForm.id ? "Guardar cambios" : "Publicar"}
            </button>
            <button style={styles.btnLink} onClick={() => setProductoForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---------- LIGHTBOX ---------- */}
      {lightbox && (
        <div style={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <img
            src={lightbox.imagenes[lightbox.index]}
            alt=""
            style={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
          {lightbox.imagenes.length > 1 && (
            <div style={styles.lightboxNav} onClick={(e) => e.stopPropagation()}>
              <button
                style={styles.lightboxBtn}
                onClick={() =>
                  setLightbox((lb) => ({
                    ...lb,
                    index: (lb.index - 1 + lb.imagenes.length) % lb.imagenes.length,
                  }))
                }
              >
                ‹
              </button>
              <span style={{ color: "#fff", fontSize: 14 }}>
                {lightbox.index + 1} / {lightbox.imagenes.length}
              </span>
              <button
                style={styles.lightboxBtn}
                onClick={() =>
                  setLightbox((lb) => ({ ...lb, index: (lb.index + 1) % lb.imagenes.length }))
                }
              >
                ›
              </button>
            </div>
          )}
          <button style={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      {/* ---------- CARRITO (DRAWER) ---------- */}
      {cartOpen && (
        <div style={styles.overlay} onClick={() => setCartOpen(false)}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={styles.modalTitle}>🛒 Tu carrito</h3>
              <button style={styles.btnLink} onClick={() => setCartOpen(false)}>Cerrar</button>
            </div>

            {carritoDetallado.length === 0 ? (
              <div style={styles.emptyState}>Tu carrito está vacío. ¡Agrega algo que te guste!</div>
            ) : (
              <>
                {Object.entries(carritoPorVendedor).map(([vId, items]) => {
                  const vendedor = vendedorById[vId];
                  const tipoEntrega = entregaPorVendedor[vId] || "recoger";
                  const subtotal = items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
                  return (
                    <div key={vId} style={styles.cartGroup}>
                      <div style={styles.cartGroupTitle}>🏪 {vendedor?.nombre || "Vendedor"}</div>
                      {items.map((item) => (
                        <div key={item.productoId} style={styles.cartItem}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.filaNombre}>{item.producto.nombre}</div>
                            <div style={styles.filaDetalle}>{money(item.producto.precio)} c/u</div>
                          </div>
                          <div style={styles.qtyRow}>
                            <button style={styles.qtyBtn} onClick={() => cambiarCantidad(item.productoId, -1)}>−</button>
                            <span style={styles.qtyNum}>{item.cantidad}</span>
                            <button style={styles.qtyBtn} onClick={() => cambiarCantidad(item.productoId, 1)}>+</button>
                            <button
                              style={{ ...styles.btnMini, color: RED }}
                              onClick={() => quitarDelCarrito(item.productoId)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                      <div style={styles.entregaRow}>
                        <button
                          style={{ ...styles.entregaBtn, ...(tipoEntrega === "recoger" ? styles.entregaBtnActiva : {}) }}
                          onClick={() => elegirEntrega(vId, "recoger")}
                        >
                          🏠 Recoger (gratis)
                        </button>
                        <button
                          style={{ ...styles.entregaBtn, ...(tipoEntrega === "domicilio" ? styles.entregaBtnActiva : {}) }}
                          onClick={() => elegirEntrega(vId, "domicilio")}
                        >
                          🚚 Envío (+{money(COSTO_ENVIO)})
                        </button>
                      </div>
                      <div style={styles.cartSubtotal}>
                        Subtotal: {money(subtotal + (tipoEntrega === "domicilio" ? COSTO_ENVIO : 0))}
                      </div>
                      <button style={styles.btnPrimario} onClick={() => checkoutPorVendedor(vId)}>
                        Pedir por WhatsApp
                      </button>
                    </div>
                  );
                })}
                <div style={styles.cartTotal}>Total general: {money(carritoTotal)}</div>
              </>
            )}
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        Libre Mercado Ventas · Zona Conurbada de Tamaulipas · Pedidos directo por WhatsApp
      </footer>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: BG,
    minHeight: "100vh",
    color: INK,
    paddingBottom: 60,
  },
  loadingScreen: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: BG,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: DIM,
    fontSize: 16,
  },
  header: {
    padding: "18px 16px 0",
    maxWidth: 1080,
    margin: "0 auto",
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  eyebrow: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: GOLD,
  },
  title: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 800,
    fontSize: "clamp(22px, 4.5vw, 34px)",
    lineHeight: 1.15,
    color: GREEN,
    margin: "4px 0 0",
  },
  cartBtn: {
    position: "relative",
    background: "#5A2A1B",
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 20,
    color: "#fff",
  },
  cartBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    background: GOLD,
    color: "#fff",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    minWidth: 20,
    height: 20,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
  },
  nav: {
    display: "flex",
    gap: 8,
    marginTop: 16,
    borderBottom: `2px solid ${BORDER}`,
  },
  navBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 14px",
    fontSize: 15,
    fontWeight: 600,
    color: DIM,
    borderBottom: "3px solid transparent",
    marginBottom: -2,
  },
  navBtnActive: {
    color: GREEN,
    borderBottom: `3px solid ${GREEN}`,
  },
  errorBanner: {
    maxWidth: 1080,
    margin: "12px auto 0",
    background: "#FBE9E7",
    color: RED,
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 14,
    cursor: "pointer",
  },
  toast: {
    position: "fixed",
    top: 14,
    left: "50%",
    transform: "translateX(-50%)",
    background: INK,
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 999,
    fontSize: 14,
    zIndex: 60,
    animation: "toastIn .25s ease",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  savingBadge: {
    position: "fixed",
    bottom: 14,
    right: 14,
    background: INK,
    color: "#fff",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    zIndex: 60,
    opacity: 0.85,
  },
  filters: {
    maxWidth: 1080,
    margin: "16px auto",
    padding: "0 16px",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  searchInput: {
    flex: "1 1 220px",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    fontSize: 15,
    background: "#fff",
    color: INK,
  },
  select: {
    flex: "1 1 160px",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    fontSize: 15,
    background: "#fff",
    color: INK,
  },
  emptyState: {
    maxWidth: 1080,
    margin: "40px auto",
    padding: "0 16px",
    textAlign: "center",
    color: DIM,
    fontSize: 15,
  },
  grid: {
    maxWidth: 1080,
    margin: "0 auto",
    padding: "0 16px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))",
    gap: 14,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    border: `1px solid ${BORDER}`,
    transition: "box-shadow .2s ease, transform .2s ease",
    display: "flex",
    flexDirection: "column",
  },
  cardImageWrap: {
    position: "relative",
    aspectRatio: "1 / 1",
    background: "#EFE7D8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: "100%", objectFit: "cover" },
  cardImageCount: {
    position: "absolute",
    bottom: 8,
    right: 8,
    background: "rgba(18,58,61,0.75)",
    color: "#fff",
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
  },
  cardImagePlaceholder: { fontSize: 40, opacity: 0.5 },
  cardBody: { padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  cardCategoria: { fontSize: 11, color: DIM, textTransform: "uppercase", letterSpacing: 0.5 },
  cardNombre: { fontWeight: 600, fontSize: 15, lineHeight: 1.3 },
  cardPrecio: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 17,
    color: GREEN,
  },
  cardVendedor: { fontSize: 12, color: DIM, marginBottom: 6 },
  btnPrimario: {
    background: GREEN,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 700,
    width: "100%",
    marginTop: "auto",
  },
  btnLink: {
    background: "transparent",
    border: "none",
    color: DIM,
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 6px",
    textDecoration: "underline",
  },
  btnMini: {
    background: "#F1F6F5",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: INK,
  },
  panel: { maxWidth: 1080, margin: "20px auto", padding: "0 16px" },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  panelTitle: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 22,
    margin: 0,
    color: INK,
  },
  panelSub: { fontSize: 13, color: DIM, marginTop: 4 },
  subTitle: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 17,
    margin: "24px 0 10px",
    color: INK,
  },
  avisoVerde: {
    background: "#E5F4EF",
    color: "#1B7A5A",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    margin: "14px 0",
  },
  avisoAmarillo: {
    background: "#FCF3DC",
    color: "#9C6B14",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    margin: "14px 0",
  },
  avisoRojo: {
    background: "#FBE9E7",
    color: RED,
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    margin: "14px 0",
  },
  listado: { display: "flex", flexDirection: "column", gap: 10, marginTop: 14 },
  filaProducto: {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 12,
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  filaThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    background: "#EFE7D8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    overflow: "hidden",
    flexShrink: 0,
  },
  filaThumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  filaNombre: { fontWeight: 600, fontSize: 15 },
  filaDetalle: { fontSize: 13, color: DIM },
  filaAcciones: { display: "flex", gap: 6, flexWrap: "wrap" },
  tagPausado: {
    background: "#FCF3DC",
    color: "#9C6B14",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    marginLeft: 6,
  },
  statsRow: { display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" },
  statBox: {
    flex: "1 1 140px",
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 16,
    textAlign: "center",
  },
  statNum: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 800,
    fontSize: 22,
    color: GREEN,
  },
  statLabel: { fontSize: 12, color: DIM, marginTop: 4 },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(18,58,61,0.45)",
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "#fff",
    borderRadius: 18,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  modalTitle: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 19,
    margin: 0,
    color: INK,
  },
  modalSub: { fontSize: 13, color: DIM, margin: 0 },
  input: {
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    fontSize: 15,
    background: "#fff",
    color: INK,
    width: "100%",
  },
  uploadBtn: {
    display: "block",
    textAlign: "center",
    background: "#F1F6F5",
    border: `1px dashed ${GREEN}`,
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
    color: GREEN,
    cursor: "pointer",
  },
  thumbRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  thumbWrap: { position: "relative", width: 64, height: 64 },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: 10,
    border: `1px solid ${BORDER}`,
  },
  thumbX: {
    position: "absolute",
    top: -6,
    right: -6,
    background: RED,
    color: "#fff",
    border: "none",
    borderRadius: 999,
    width: 20,
    height: 20,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  drawer: {
    background: "#fff",
    borderRadius: "18px 0 0 18px",
    padding: 20,
    width: "100%",
    maxWidth: 420,
    height: "100%",
    marginLeft: "auto",
    overflowY: "auto",
    animation: "floatCartIn .25s ease",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  drawerHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cartGroup: {
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cartGroupTitle: { fontWeight: 700, fontSize: 15 },
  cartItem: { display: "flex", alignItems: "center", gap: 10 },
  qtyRow: { display: "flex", alignItems: "center", gap: 6 },
  qtyBtn: {
    background: "#F1F6F5",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    color: INK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNum: { fontWeight: 700, minWidth: 18, textAlign: "center" },
  entregaRow: { display: "flex", gap: 8 },
  entregaBtn: {
    flex: 1,
    background: "#F1F6F5",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: DIM,
  },
  entregaBtnActiva: {
    background: "#E5F4EF",
    border: `1px solid ${GREEN}`,
    color: GREEN,
  },
  cartSubtotal: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  cartTotal: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 800,
    fontSize: 18,
    color: GREEN,
    textAlign: "right",
    marginTop: 4,
  },
  lightboxOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,20,22,0.92)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 16,
  },
  lightboxImg: {
    maxWidth: "94vw",
    maxHeight: "78vh",
    borderRadius: 12,
    objectFit: "contain",
  },
  lightboxNav: { display: "flex", alignItems: "center", gap: 18 },
  lightboxBtn: {
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    width: 42,
    height: 42,
    fontSize: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxClose: {
    position: "absolute",
    top: 14,
    right: 14,
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    width: 38,
    height: 38,
    fontSize: 16,
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: DIM,
    padding: "30px 16px 10px",
  },
};
