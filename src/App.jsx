import { useState, useEffect, useMemo, useCallback } from "react";

const STORAGE_KEY = "marketplace-zc-data";
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
const GOLD = "#E2603F"; // coral — acentos de energía (eyebrow, destacados)
const RED = "#C24444";
const INK = "#123A3D"; // tinta con matiz petróleo, coherente con el turquesa
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
  const [entregaPorVendedor, setEntregaPorVendedor] = useState({}); // { [vendedorId]: 'domicilio' | 'recoger' }

  // filtros comprador
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");

  // registro vendedor
  const [showRegistroVendedor, setShowRegistroVendedor] = useState(false);
  const [nuevoVendedor, setNuevoVendedor] = useState({ nombre: "", whatsapp: "", ciudad: CIUDADES[0] });

  // form producto
  const [productoForm, setProductoForm] = useState(null); // null = cerrado, {} nuevo, {...} editar
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { imagenes: [], index: 0 }

  // admin
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((mensaje) => {
    setToast(mensaje);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setVendedores(parsed.vendedores || []);
          setProductos(parsed.productos || []);
        }
      } catch (e) {}
      try {
        const meRes = await window.storage.get(ME_KEY, false);
        if (meRes && meRes.value) setIdentidad(JSON.parse(meRes.value));
      } catch (e) {}
      try {
        const cartRes = await window.storage.get(CART_KEY, false);
        if (cartRes && cartRes.value) setCarrito(JSON.parse(cartRes.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (nextVendedores, nextProductos) => {
    setSaving(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify({ vendedores: nextVendedores, productos: nextProductos }), true);
    } catch (e) {
      setError("No se pudo guardar. Intenta de nuevo.");
    }
    setSaving(false);
  }, []);

  const persistIdentidad = useCallback(async (next) => {
    setIdentidad(next);
    try {
      await window.storage.set(ME_KEY, JSON.stringify(next), false);
    } catch (e) {}
  }, []);

  const persistCarrito = useCallback(async (next) => {
    setCarrito(next);
    try {
      await window.storage.set(CART_KEY, JSON.stringify(next), false);
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

  const carritoTotal = carritoDetallado.reduce(
    (sum, item) => sum + item.producto.precio * item.cantidad,
    0
  ) + Object.keys(carritoPorVendedor).reduce(
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
      ultimoPago: hoyISO(), // primer mes de cortesía/prueba al registrarse
      ventas: 0,
    };
    const nextVendedores = [...vendedores, vendedor];
    setVendedores(nextVendedores);
    persist(nextVendedores, productos);
    persistIdentidad({ tipo: "vendedor", vendedorId: id, nombre });
    setShowRegistroVendedor(false);
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
      nextProductos = productos.map((p) => (p.id === f.id ? { ...f, precio: Number(f.precio), stock: Number(f.stock) || 0 } : p));
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
  }

  // ---- carrito ----
  function agregarAlCarrito(producto) {
    const existing = carrito.find((c) => c.productoId === producto.id);
    let next;
    if (existing) {
      next = carrito.map((c) => (c.productoId === producto.id ? { ...c, cantidad: c.cantidad + 1 } : c));
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
    const mensaje = `Hola ${vendedor.nombre}, quiero pedir:\n\n${lineas.join("\n")}\n\nEntrega: ${entregaTexto}\nSubtotal: ${money(subtotal)}\nTotal: ${money(total)}\n\n(Pedido desde Altama Marketplace)`;
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
  }

  function adminToggleActivoVendedor(vendedorId) {
    const next = vendedores.map((v) =>
      v.id === vendedorId ? { ...v, activo: !v.activo } : v
    );
    setVendedores(next);
    persist(next, productos);
  }

  function adminEliminarProducto(id) {
    eliminarProducto(id);
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
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes toastIn {
          from { transform: translate(-50%, -12px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>

      {toast && <div style={styles.toast}>{toast}</div>}

      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <div style={styles.eyebrow}>libremercadoventas.com</div>
            <h1 style={styles.title}>Altama · Tampico, Madero y Altamira</h1>
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

      {error && <div style={styles.errorBanner}>{error}</div>}

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
                return (
                <div key={p.id} className="prod-card" style={styles.card}>
                  <div
                    style={{ ...styles.cardImageWrap, cursor: imgs.length ? "zoom-in" : "default" }}
                    onClick={() => imgs.length && setLightbox({ imagenes: imgs, index: 0 })}
                  >
                    {imgs.length ? (
                      <>
                        <img src={imgs[0]} alt={p.nombre} style={styles.cardImage} />
                        {imgs.length > 1 && (
                          <span style={styles.cardImageCount}>📷 {imgs.length}</span>
                        )}
                      </>
                    ) : (
                      <div style={styles.cardImagePlaceholder}>📦</div>
                    )}
                  </div>
                  <div style={styles.cardBody}>
                    <div style={styles.cardCategoria}>{p.categoria} · {p.ciudad}</div>
                    <div style={styles.cardNombre}>{p.nombre}</div>
                    <div style={styles.cardPrecio}>{money(p.precio)}</div>
                    <div style={styles.cardVendedor}>
                      {vendedorById[p.vendedorId]?.nombre}
                      {(() => {
                        const rep = reputacion(vendedorById[p.vendedorId]?.ventas);
                        return <span style={styles.repBadgeInline}> · {rep.emoji} {rep.label}</span>;
                      })()}
                    </div>
                    <button style={styles.cardBtn} onClick={() => agregarAlCarrito(p)}>
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

      {/* ---------- TAB VENDER ---------- */}
      {tab === "vender" && miVendedor && (
        <section>
          <div style={styles.vendedorHeader}>
            <div>
              <div style={styles.vendedorNombre}>{miVendedor.nombre}</div>
              <div style={styles.vendedorMeta}>{miVendedor.ciudad} · {miVendedor.whatsapp}</div>
              <div style={styles.vendedorRep}>
                {(() => {
                  const rep = reputacion(miVendedor.ventas);
                  return `${rep.emoji} ${rep.label} · ${miVendedor.ventas || 0} venta(s)`;
                })()}
              </div>
            </div>
            <button onClick={cerrarSesionVendedor} style={styles.logoutBtn}>Cerrar sesión</button>
          </div>

          {(() => {
            const dias = diasRestantes(miVendedor.ultimoPago);
            const vencido = dias < 0;
            return (
              <div style={{ ...styles.vendorPagoBanner, ...(vencido ? styles.pagoVencidoBanner : styles.pagoVigenteBanner) }}>
                {vencido
                  ? `⚠️ Tu cuota mensual (${money(CUOTA_MENSUAL)}) está vencida. Contacta al administrador para reactivar tu tienda.`
                  : `✓ Tu cuota está vigente. Vence en ${dias} día(s).`}
              </div>
            );
          })()}

          <button style={styles.newProductBtn} onClick={abrirNuevoProducto}>+ Nuevo producto</button>

          {misProductos.length === 0 ? (
            <div style={styles.emptyState}>Aún no has publicado productos.</div>
          ) : (
            <div style={styles.productTable}>
              {misProductos.map((p) => (
                <div key={p.id} style={styles.productRow}>
                  <div style={styles.productRowInfo}>
                    <div style={{ ...styles.productRowNombre, ...(p.activo ? {} : styles.productRowInactivo) }}>
                      {p.nombre}
                    </div>
                    <div style={styles.productRowMeta}>
                      {p.categoria} · {money(p.precio)} · stock: {p.stock} · vendidos: {p.vendidos || 0}
                    </div>
                  </div>
                  <div style={styles.productRowActions}>
                    <button onClick={() => marcarVentaProducto(p)} style={styles.smallBtnVenta}>
                      ✅ +1 venta
                    </button>
                    <button onClick={() => toggleActivoProducto(p.id)} style={styles.smallBtnOutline}>
                      {p.activo ? "Pausar" : "Activar"}
                    </button>
                    <button onClick={() => abrirEditarProducto(p)} style={styles.smallBtnOutline}>Editar</button>
                    <button onClick={() => eliminarProducto(p.id)} style={styles.smallBtnDanger}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- TAB ADMIN ---------- */}
      {tab === "admin" && identidad.tipo === "admin" && (
        <section>
          <div style={styles.adminPanelHeader}>
            <span style={styles.adminPanelBadge}>🔑 Sesión de administrador activa</span>
            <button onClick={adminLogout} style={styles.logoutBtn}>Salir</button>
          </div>
          <h2 style={styles.sectionTitle}>Vendedores ({vendedores.length})</h2>
          <div style={styles.productTable}>
            {vendedores.map((v) => {
              const dias = diasRestantes(v.ultimoPago);
              const vencido = dias < 0;
              return (
                <div key={v.id} style={styles.productRow}>
                  <div style={styles.productRowInfo}>
                    <div style={styles.productRowNombre}>
                      {v.nombre}{" "}
                      {v.activo === false && <span style={styles.pausadoTag}>PAUSADA</span>}
                    </div>
                    <div style={styles.productRowMeta}>
                      {v.ciudad} · {v.whatsapp} · {productos.filter(p => p.vendedorId === v.id).length} productos
                      {" · "}
                      {(() => {
                        const rep = reputacion(v.ventas);
                        return `${rep.emoji} ${rep.label} (${v.ventas || 0} ventas)`;
                      })()}
                    </div>
                    <div style={{ ...styles.pagoStatus, ...(vencido ? styles.pagoVencido : styles.pagoVigente) }}>
                      {vencido
                        ? `⚠️ Cuota vencida hace ${Math.abs(dias)} día(s)`
                        : `✓ Cuota vigente — vence en ${dias} día(s)`}
                    </div>
                  </div>
                  <div style={styles.productRowActions}>
                    <button onClick={() => adminMarcarPago(v.id)} style={styles.smallBtnPago}>
                      💰 Marcar pago ({money(CUOTA_MENSUAL)})
                    </button>
                    <button onClick={() => adminToggleActivoVendedor(v.id)} style={styles.smallBtnOutline}>
                      {v.activo === false ? "Reactivar" : "Pausar"}
                    </button>
                    <button onClick={() => adminEliminarVendedor(v.id)} style={styles.smallBtnDanger}>Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>

          <h2 style={{ ...styles.sectionTitle, marginTop: 28 }}>Todos los productos ({productos.length})</h2>
          <div style={styles.productTable}>
            {productos.map((p) => (
              <div key={p.id} style={styles.productRow}>
                <div style={styles.productRowInfo}>
                  <div style={styles.productRowNombre}>{p.nombre}</div>
                  <div style={styles.productRowMeta}>
                    {vendedorById[p.vendedorId]?.nombre} · {p.categoria} · {money(p.precio)}
                  </div>
                </div>
                <button onClick={() => adminEliminarProducto(p.id)} style={styles.smallBtnDanger}>Eliminar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- MODAL: registro vendedor ---------- */}
      {showRegistroVendedor && (
        <div style={styles.modalOverlay} onClick={() => setShowRegistroVendedor(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Registra tu tienda</div>
            <input
              style={styles.modalInput}
              placeholder="Nombre de tu tienda"
              value={nuevoVendedor.nombre}
              onChange={(e) => setNuevoVendedor((s) => ({ ...s, nombre: e.target.value }))}
            />
            <input
              style={styles.modalInput}
              placeholder="WhatsApp (con código de país, ej. 528331234567)"
              value={nuevoVendedor.whatsapp}
              onChange={(e) => setNuevoVendedor((s) => ({ ...s, whatsapp: e.target.value }))}
            />
            <select
              style={styles.modalInput}
              value={nuevoVendedor.ciudad}
              onChange={(e) => setNuevoVendedor((s) => ({ ...s, ciudad: e.target.value }))}
            >
              {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={styles.modalActions}>
              <button onClick={registrarVendedor} style={styles.modalConfirmBtn}>Crear mi tienda</button>
              <button onClick={() => setShowRegistroVendedor(false)} style={styles.modalCancelBtn}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- MODAL: producto ---------- */}
      {productoForm && (
        <div style={styles.modalOverlay} onClick={() => setProductoForm(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>{productoForm.id ? "Editar producto" : "Nuevo producto"}</div>
            <input
              style={styles.modalInput}
              placeholder="Nombre del producto"
              value={productoForm.nombre}
              onChange={(e) => setProductoForm((f) => ({ ...f, nombre: e.target.value }))}
            />
            <input
              style={styles.modalInput}
              type="number"
              placeholder="Precio (MXN)"
              value={productoForm.precio}
              onChange={(e) => setProductoForm((f) => ({ ...f, precio: e.target.value }))}
            />
            <select
              style={styles.modalInput}
              value={productoForm.categoria}
              onChange={(e) => setProductoForm((f) => ({ ...f, categoria: e.target.value }))}
            >
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              style={styles.modalInput}
              value={productoForm.ciudad}
              onChange={(e) => setProductoForm((f) => ({ ...f, ciudad: e.target.value }))}
            >
              {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {productoForm.imagenes && productoForm.imagenes.length > 0 && (
              <div style={styles.thumbRow}>
                {productoForm.imagenes.map((img, idx) => (
                  <div key={idx} style={styles.thumbWrap}>
                    <img
                      src={img}
                      alt={`Foto ${idx + 1}`}
                      style={styles.thumbImg}
                      onClick={() => setLightbox({ imagenes: productoForm.imagenes, index: idx })}
                    />
                    <button
                      type="button"
                      onClick={() => quitarImagenForm(idx)}
                      style={styles.thumbRemoveBtn}
                      aria-label="Quitar foto"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.imagenesHint}>
              {(productoForm.imagenes?.length || 0)}/{MAX_IMAGENES} fotos · sube al menos 3 para que se vea mejor tu producto
            </div>
            {(productoForm.imagenes?.length || 0) < MAX_IMAGENES && (
              <label style={styles.fileUploadBtn}>
                {subiendoImagen ? "Procesando fotos…" : "📷 Agregar fotos"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagenFiles}
                  style={styles.fileInputHidden}
                  disabled={subiendoImagen}
                />
              </label>
            )}
            <input
              style={styles.modalInput}
              type="number"
              placeholder="Stock disponible"
              value={productoForm.stock}
              onChange={(e) => setProductoForm((f) => ({ ...f, stock: e.target.value }))}
            />
            <div style={styles.modalActions}>
              <button
                onClick={guardarProducto}
                disabled={subiendoImagen}
                style={{ ...styles.modalConfirmBtn, opacity: subiendoImagen ? 0.5 : 1 }}
              >
                Guardar
              </button>
              <button onClick={() => setProductoForm(null)} style={styles.modalCancelBtn}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- MODAL: admin login ---------- */}
      {showAdminLogin && (
        <div style={styles.modalOverlay} onClick={() => setShowAdminLogin(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Acceso administrador</div>
            <input
              type="password"
              style={styles.modalInput}
              placeholder="Contraseña"
              value={adminInput}
              onChange={(e) => setAdminInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
            />
            {adminError && <div style={styles.adminErrorText}>{adminError}</div>}
            <div style={styles.modalActions}>
              <button onClick={tryAdminLogin} style={styles.modalConfirmBtn}>Entrar</button>
              <button onClick={() => setShowAdminLogin(false)} style={styles.modalCancelBtn}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {cartCount > 0 && !cartOpen && (
        <button style={styles.floatingCartBar} onClick={() => setCartOpen(true)}>
          <span style={styles.floatingCartLeft}>
            🛒 {cartCount} {cartCount === 1 ? "producto" : "productos"}
          </span>
          <span style={styles.floatingCartRight}>{money(carritoTotal)} · Ver carrito →</span>
        </button>
      )}

      {/* ---------- DRAWER: carrito ---------- */}
      {cartOpen && (
        <div style={styles.modalOverlay} onClick={() => setCartOpen(false)}>
          <div style={styles.cartDrawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.cartHeader}>
              <div style={styles.modalTitle}>Tu carrito</div>
              <button onClick={() => setCartOpen(false)} style={styles.closeBtn}>×</button>
            </div>

            {carritoDetallado.length === 0 ? (
              <div style={styles.emptyState}>Tu carrito está vacío.</div>
            ) : (
              <>
                <div style={styles.cartItems}>
                  {Object.entries(carritoPorVendedor).map(([vendedorId, items]) => {
                    const tipoEntrega = entregaPorVendedor[vendedorId] || "recoger";
                    const subtotalVendedor = items.reduce((s, it) => s + it.producto.precio * it.cantidad, 0);
                    const totalVendedor = subtotalVendedor + (tipoEntrega === "domicilio" ? COSTO_ENVIO : 0);
                    return (
                    <div key={vendedorId} style={styles.cartVendorGroup}>
                      <div style={styles.cartVendorName}>{vendedorById[vendedorId]?.nombre}</div>
                      {items.map((item) => (
                        <div key={item.productoId} style={styles.cartItemRow}>
                          <div style={styles.cartItemName}>{item.producto.nombre}</div>
                          <div style={styles.cartItemControls}>
                            <button onClick={() => cambiarCantidad(item.productoId, -1)} style={styles.qtyBtn}>−</button>
                            <span style={styles.qtyText}>{item.cantidad}</span>
                            <button onClick={() => cambiarCantidad(item.productoId, 1)} style={styles.qtyBtn}>+</button>
                          </div>
                          <div style={styles.cartItemPrice}>{money(item.producto.precio * item.cantidad)}</div>
                          <button onClick={() => quitarDelCarrito(item.productoId)} style={styles.cartRemoveBtn}>×</button>
                        </div>
                      ))}

                      <div style={styles.entregaOptions}>
                        <button
                          onClick={() => elegirEntrega(vendedorId, "recoger")}
                          style={{ ...styles.entregaBtn, ...(tipoEntrega === "recoger" ? styles.entregaBtnActiva : {}) }}
                        >
                          🏠 Recoger — gratis
                        </button>
                        <button
                          onClick={() => elegirEntrega(vendedorId, "domicilio")}
                          style={{ ...styles.entregaBtn, ...(tipoEntrega === "domicilio" ? styles.entregaBtnActiva : {}) }}
                        >
                          🚚 A domicilio — {money(COSTO_ENVIO)}
                        </button>
                      </div>

                      <div style={styles.cartSubtotalVendedor}>Subtotal con envío: {money(totalVendedor)}</div>

                      <button
                        onClick={() => checkoutPorVendedor(vendedorId)}
                        style={styles.checkoutVendorBtn}
                      >
                        Pedir por WhatsApp a {vendedorById[vendedorId]?.nombre}
                      </button>
                    </div>
                    );
                  })}
                </div>
                <div style={styles.cartTotal}>Total: {money(carritoTotal)}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- LIGHTBOX: visor de fotos ampliado ---------- */}
      {lightbox && (
        <div style={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button style={styles.lightboxCloseBtn} onClick={() => setLightbox(null)} aria-label="Cerrar">×</button>

          {lightbox.imagenes.length > 1 && (
            <button
              style={{ ...styles.lightboxNavBtn, left: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((l) => ({
                  ...l,
                  index: (l.index - 1 + l.imagenes.length) % l.imagenes.length,
                }));
              }}
              aria-label="Foto anterior"
            >
              ‹
            </button>
          )}

          <img
            src={lightbox.imagenes[lightbox.index]}
            alt={`Foto ${lightbox.index + 1}`}
            style={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />

          {lightbox.imagenes.length > 1 && (
            <button
              style={{ ...styles.lightboxNavBtn, right: 12 }}
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((l) => ({
                  ...l,
                  index: (l.index + 1) % l.imagenes.length,
                }));
              }}
              aria-label="Foto siguiente"
            >
              ›
            </button>
          )}

          {lightbox.imagenes.length > 1 && (
            <div style={styles.lightboxCounter} onClick={(e) => e.stopPropagation()}>
              {lightbox.index + 1} / {lightbox.imagenes.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "'Inter', sans-serif",
    background: BG,
    minHeight: "100vh",
    color: INK,
    paddingBottom: 60,
  },
  loadingScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: BG,
    color: DIM,
    fontFamily: "'Inter', sans-serif",
  },
  toast: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    background: INK,
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    zIndex: 200,
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    animation: "toastIn 0.2s ease-out",
    whiteSpace: "nowrap",
  },
  header: {
    background: "#fff",
    borderBottom: `1px solid ${BORDER}`,
    padding: "18px 20px 0",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    maxWidth: 1100,
    margin: "0 auto",
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.02em",
    color: GOLD,
    fontWeight: 700,
    marginBottom: 4,
  },
  title: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 800,
    fontSize: 22,
    margin: 0,
    color: GREEN,
  },
  cartBtn: {
    position: "relative",
    background: GOLD,
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 20,
    padding: "12px 18px",
    boxShadow: "0 4px 14px rgba(226,96,63,0.4)",
  },
  cartBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    background: INK,
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
    border: "2px solid #fff",
  },
  floatingCartBar: {
    position: "fixed",
    left: "50%",
    bottom: 20,
    transform: "translateX(-50%)",
    animation: "floatCartIn 0.25s ease-out",
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: GOLD,
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "14px 22px",
    boxShadow: "0 10px 30px rgba(226,96,63,0.45)",
    fontWeight: 700,
    fontSize: 14,
    width: "min(92%, 420px)",
    justifyContent: "space-between",
  },
  floatingCartLeft: { fontSize: 14 },
  floatingCartRight: { fontSize: 13, opacity: 0.95 },
  nav: {
    display: "flex",
    gap: 4,
    maxWidth: 1100,
    margin: "16px auto 0",
  },
  navBtn: {
    border: "none",
    background: "transparent",
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    color: DIM,
    borderBottom: "2px solid transparent",
  },
  navBtnActive: {
    color: GREEN,
    borderBottom: `2px solid ${GREEN}`,
  },
  errorBanner: {
    maxWidth: 1100,
    margin: "16px auto 0",
    background: "#FBE4E1",
    color: "#9C3A2E",
    border: "1px solid #EFC1BA",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
  },
  filters: {
    maxWidth: 1100,
    margin: "20px auto 20px",
    padding: "0 20px",
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  searchInput: {
    flex: "2 1 220px",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    fontSize: 14,
  },
  select: {
    flex: "1 1 160px",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    fontSize: 14,
    background: "#fff",
  },
  grid: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 20px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    overflow: "hidden",
    transition: "box-shadow 0.15s ease, transform 0.15s ease",
  },
  cardImageWrap: {
    height: 140,
    background: "#EFE6D5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cardImage: { width: "100%", height: "100%", objectFit: "cover" },
  cardImageCount: {
    position: "absolute",
    bottom: 8,
    right: 8,
    background: "rgba(18,58,61,0.75)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 999,
  },
  cardImagePlaceholder: { fontSize: 36, opacity: 0.4 },
  cardBody: { padding: 14 },
  cardCategoria: { fontSize: 11, color: DIM, marginBottom: 4, fontWeight: 600 },
  cardNombre: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  cardPrecio: { fontSize: 16, fontWeight: 800, color: GREEN, marginBottom: 4 },
  cardVendedor: { fontSize: 12, color: DIM, marginBottom: 10 },
  repBadgeInline: { color: GREEN, fontWeight: 700 },
  cardBtn: {
    width: "100%",
    padding: "9px",
    borderRadius: 8,
    border: "none",
    background: INK,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
  },
  emptyState: {
    maxWidth: 1100,
    margin: "40px auto",
    textAlign: "center",
    color: DIM,
    fontSize: 14,
    padding: "0 20px",
  },
  sectionTitle: {
    fontFamily: "'Poppins', sans-serif",
    fontSize: 16,
    fontWeight: 700,
    maxWidth: 1100,
    margin: "0 auto 12px",
    padding: "0 20px",
  },
  adminPanelHeader: {
    maxWidth: 1100,
    margin: "20px auto 16px",
    padding: "0 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  adminPanelBadge: {
    fontSize: 13,
    fontWeight: 700,
    color: GREEN,
    background: "#E4F5F3",
    padding: "6px 12px",
    borderRadius: 999,
  },
  vendedorHeader: {
    maxWidth: 1100,
    margin: "20px auto 16px",
    padding: "0 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vendedorNombre: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 18 },
  vendedorMeta: { fontSize: 13, color: DIM },
  vendedorRep: { fontSize: 13, color: GREEN, fontWeight: 700, marginTop: 4 },
  logoutBtn: {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: DIM,
  },
  newProductBtn: {
    display: "block",
    margin: "0 auto 20px",
    maxWidth: 1060,
    marginLeft: 20,
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: GREEN,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
  },
  productTable: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  productRow: {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  productRowInfo: {},
  productRowNombre: { fontWeight: 700, fontSize: 14 },
  productRowInactivo: { color: DIM, textDecoration: "line-through" },
  productRowMeta: { fontSize: 12, color: DIM, marginTop: 2 },
  productRowActions: { display: "flex", gap: 6 },
  smallBtnVenta: {
    border: "none",
    background: GREEN,
    color: "#fff",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  smallBtnOutline: {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: INK,
  },
  smallBtnDanger: {
    border: "none",
    background: "#FBE4E1",
    color: "#9C3A2E",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  smallBtnPago: {
    border: "none",
    background: "#E4F5F3",
    color: GREEN,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  pagoStatus: {
    fontSize: 12,
    fontWeight: 600,
    marginTop: 6,
  },
  pagoVigente: { color: GREEN },
  pagoVencido: { color: "#9C3A2E" },
  pausadoTag: {
    fontSize: 10,
    fontWeight: 800,
    color: "#9C3A2E",
    background: "#FBE4E1",
    padding: "2px 6px",
    borderRadius: 4,
    letterSpacing: "0.04em",
  },
  vendorPagoBanner: {
    maxWidth: 1060,
    margin: "0 20px 16px",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  },
  pagoVigenteBanner: { background: "#E4F5F3", color: GREEN },
  pagoVencidoBanner: { background: "#FBE4E1", color: "#9C3A2E" },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20,25,35,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 16,
  },
  modal: {
    background: "#fff",
    borderRadius: 14,
    padding: 22,
    width: "100%",
    maxWidth: 360,
    maxHeight: "85vh",
    overflowY: "auto",
  },
  modalTitle: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 14 },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    fontSize: 14,
    marginBottom: 10,
  },
  thumbRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  thumbWrap: {
    position: "relative",
    width: 68,
    height: 68,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    cursor: "zoom-in",
  },
  thumbRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid #fff",
    background: RED,
    color: "#fff",
    fontSize: 12,
    lineHeight: "12px",
    padding: 0,
  },
  imagenesHint: {
    fontSize: 11,
    color: DIM,
    marginBottom: 8,
  },
  fileUploadBtn: {
    display: "block",
    width: "100%",
    textAlign: "center",
    padding: "11px",
    borderRadius: 8,
    border: `1px dashed ${GREEN}`,
    background: "#EAF7F5",
    color: GREEN,
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 10,
    cursor: "pointer",
    position: "relative",
  },
  fileInputHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    border: 0,
  },
  modalActions: { display: "flex", gap: 8, marginTop: 4 },
  modalConfirmBtn: {
    flex: 1,
    padding: "11px",
    borderRadius: 8,
    border: "none",
    background: GREEN,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
  },
  modalCancelBtn: {
    padding: "11px 16px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: DIM,
    fontWeight: 600,
    fontSize: 14,
  },
  adminErrorText: { fontSize: 12, color: "#9C3A2E", marginBottom: 10 },
  cartDrawer: {
    background: "#fff",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
  },
  cartHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  closeBtn: { border: "none", background: "transparent", fontSize: 22, color: DIM, lineHeight: "20px" },
  cartItems: { overflowY: "auto", flex: 1 },
  cartVendorGroup: {
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: 14,
    marginBottom: 14,
  },
  cartVendorName: { fontWeight: 700, fontSize: 13, color: GREEN, marginBottom: 8 },
  cartItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cartItemName: { flex: 1, fontSize: 13, fontWeight: 600 },
  cartItemControls: { display: "flex", alignItems: "center", gap: 6 },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    fontSize: 13,
    lineHeight: "13px",
  },
  qtyText: { fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: "center" },
  cartItemPrice: { fontSize: 13, fontWeight: 700, minWidth: 70, textAlign: "right" },
  cartRemoveBtn: { border: "none", background: "transparent", color: DIM, fontSize: 16 },
  entregaOptions: {
    display: "flex",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  entregaBtn: {
    flex: 1,
    padding: "8px 6px",
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    color: DIM,
    fontSize: 12,
    fontWeight: 600,
  },
  entregaBtnActiva: {
    border: `1px solid ${GREEN}`,
    background: "#E4F5F3",
    color: GREEN,
  },
  cartSubtotalVendedor: {
    fontSize: 12,
    fontWeight: 700,
    color: INK,
    marginBottom: 8,
    textAlign: "right",
  },
  checkoutVendorBtn: {
    width: "100%",
    marginTop: 6,
    padding: "9px",
    borderRadius: 8,
    border: "none",
    background: "#25D366",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
  },
  cartTotal: {
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 14,
    marginTop: 10,
    fontWeight: 800,
    fontSize: 16,
    textAlign: "right",
  },
  lightboxOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,15,20,0.92)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  lightboxImage: {
    maxWidth: "92vw",
    maxHeight: "85vh",
    objectFit: "contain",
    borderRadius: 8,
    cursor: "default",
  },
  lightboxCloseBtn: {
    position: "absolute",
    top: 18,
    right: 20,
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    fontSize: 26,
    width: 40,
    height: 40,
    borderRadius: "50%",
    lineHeight: "40px",
  },
  lightboxNavBtn: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    fontSize: 30,
    width: 46,
    height: 46,
    borderRadius: "50%",
    lineHeight: "44px",
  },
  lightboxCounter: {
    position: "absolute",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 999,
  },
};


