script del fronted de mi pagina web 

/* =========================================================
   MAC CHICKEN — script.js

   ORDEN DEL ARCHIVO
   1. CONFIG ............ datos del negocio y horario
   2. DATOS DE EJEMPLO .. 🔴 aquí se reemplaza por PHP/MySQL
   3. Utilidades
   4. Estado del local (Abierto / Cerrado)   🔴 PHP/MySQL
   5. Carta (productos)                      🔴 PHP/MySQL
   6. Pedido (carrito + envío)               🔴 PHP/MySQL
   7. Reserva de mesa                        🔴 PHP/MySQL
   8. Seguimiento de pedido                  🔴 PHP/MySQL
   9. Navegación, modales y eventos
   10. Inicio

   Las funciones marcadas con 🔴 son las únicas que debes tocar
   para conectar la base de datos. Hoy devuelven datos de ejemplo
   y tienen el fetch() de PHP escrito como comentario.

   TABLAS SUGERIDAS (MySQL)
   - categorias (id, nombre)
   - productos  (id, nombre, precio, categoria_id, descripcion, imagen, etiqueta, disponible)
   - horarios   (dia 0-6, abre, cierra)   -- 0 = domingo
   - pedidos    (id, codigo, cliente, tipo, direccion, pago, notas, estado, total, creado, actualizado)
   - pedido_items (pedido_id, producto_id, cantidad, precio)
   - reservas   (id, nombre, telefono, fecha, hora, personas, notas, estado)
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   1. CONFIG
   --------------------------------------------------------- */
const CONFIG = {
    whatsapp: '51979926808',          // número con código de país, sin + ni espacios
    zona: 'America/Lima',             // la hora del local se calcula siempre en hora de Perú
    costoDelivery: 0,                 // en soles; si es 0 no se muestra la línea "Delivery"
    maxHorasReserva: 60,              // minutos antes del cierre en que ya no se aceptan reservas

    // Horario por día (0 = domingo … 6 = sábado). null = cerrado todo el día.
    // 🔴 Ajusta las horas reales. Formato 24 h "HH:MM". El horario no cruza la medianoche.
    // Luego esto vendrá de la tabla `horarios` (ver obtenerEstado()).
    horario: {
        0: { abre: '12:00', cierra: '23:00' }, // domingo
        1: null,                               // lunes (cerrado)
        2: { abre: '12:00', cierra: '23:00' }, // martes
        3: { abre: '12:00', cierra: '23:00' }, // miércoles
        4: { abre: '12:00', cierra: '23:00' }, // jueves
        5: { abre: '12:00', cierra: '23:00' }, // viernes
        6: { abre: '12:00', cierra: '23:00' }  // sábado
    }
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]; // para mostrar de lunes a domingo
const LS_CARRITO = 'macchicken_carrito_v1';
const LS_ULTIMO = 'macchicken_ultimo_pedido';

/* ---------------------------------------------------------
   2. DATOS DE EJEMPLO  🔴
   --------------------------------------------------------- */

// 🔴 Categorías (luego: tabla `categorias`). 'all' siempre existe.
const CATEGORIAS = [
    { id: 'all', nombre: 'Todos' },
    { id: 'pollo', nombre: 'Pollo y platos' },
    { id: 'bebidas', nombre: 'Bebidas' },
    { id: 'calientes', nombre: 'Calientes' }
];

// 🔴 Productos (luego: tabla `productos`). Mantén estos mismos nombres de campo
// en el JSON que devuelva PHP: id, name, price, cat, desc, img, tag, disponible.
const PRODUCTOS_DEMO = [
    { id: 0,  name: "Té filtrante", price: 3, cat: "calientes", desc: "Bebida caliente natural", img: "img/te.jpg", disponible: true },
    { id: 1,  name: "Manzanilla filtrante", price: 2.5, cat: "calientes", desc: "Relajante y digestiva", img: "img/manzanilla.jpg", disponible: true },
    { id: 2,  name: "1/4 pollo a la brasa", price: 18.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo3.jpg", tag: "El favorito", disponible: true },
    { id: 3,  name: "Pollo entero a la brasa", price: 65, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo1.jpg", tag: "Para compartir", disponible: true },
    { id: 4,  name: "1/2 pollo a la brasa", price: 37, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo2.jpg", disponible: true },
    { id: 5,  name: "Agua San Luis 625ml", price: 2, cat: "bebidas", desc: "Agua mineral sin gas", img: "img/sanluis.jpg", disponible: true },
    { id: 6,  name: "Inca Kola 1.5L", price: 8, cat: "bebidas", desc: "Gaseosa familiar", img: "img/inca.jpg", disponible: true },
    { id: 7,  name: "Inca Kola 600ml", price: 4, cat: "bebidas", desc: "Gaseosa personal", img: "img/inca3.jpg", disponible: true },
    { id: 8,  name: "Inca Kola 1L", price: 7, cat: "bebidas", desc: "Gaseosa mediana", img: "img/inca2.jpg", disponible: true },
    { id: 9,  name: "Pollo a la plancha", price: 18.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo5.jpg", disponible: true },
    { id: 10, name: "Coca Cola 600ml", price: 4, cat: "bebidas", desc: "Gaseosa personal", img: "img/coca3.jpg", disponible: true },
    { id: 11, name: "Coca Cola 1L", price: 7, cat: "bebidas", desc: "Gaseosa mediana", img: "img/coca2.jpg", disponible: true },
    { id: 12, name: "Coca Cola 1.5L", price: 8, cat: "bebidas", desc: "Gaseosa familiar", img: "img/coca.jpg", disponible: true },
    { id: 13, name: "Mostrito brasa", price: 22, cat: "pollo", desc: "Arroz chaufa + papas + ensalada", img: "img/pollo4.jpg", tag: "Combo", disponible: true },
    { id: 14, name: "Arroz chaufa", price: 16, cat: "pollo", desc: "Chaufa con pollo a la brasa", img: "img/chaufa.jpg", disponible: true },
    { id: 15, name: "Mollejitas fritas", price: 16, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo6.jpg", disponible: true },
    { id: 16, name: "Salchipapa", price: 10, cat: "pollo", desc: "Salchicha + papas fritas", img: "img/pollo7.jpg", disponible: true },
    { id: 17, name: "Chicharrón de pollo", price: 17.5, cat: "pollo", desc: "Con papas, ensalada y cremas", img: "img/pollo8.jpg", disponible: true },
    { id: 18, name: "Porción de papas", price: 8, cat: "pollo", desc: "Papas fritas crujientes", img: "img/papas.jpg", disponible: true },
    { id: 19, name: "Porción de ensalada", price: 6, cat: "pollo", desc: "Ensalada fresca", img: "img/ensa.jpg", disponible: true },
    { id: 20, name: "Porción de arroz blanco", price: 3.5, cat: "pollo", desc: "Arroz blanco graneado", img: "img/arroz.jpg", disponible: true }
];

// Etapas del seguimiento. El `id` debe coincidir con la columna `estado` de la tabla `pedidos`.
const ESTADOS_PEDIDO = [
    { id: 'recibido',   titulo: 'Pedido recibido',  desc: 'Confirmamos tu pedido.',          icono: 'fa-receipt' },
    { id: 'preparando', titulo: 'En preparación',   desc: 'Tu pollo está en la brasa.',      icono: 'fa-fire-burner' },
    { id: 'en_camino',  titulo: 'En camino',        desc: 'Tu pedido salió del local.',      icono: 'fa-motorcycle' },
    { id: 'entregado',  titulo: 'Entregado',        desc: 'Que lo disfrutes.',               icono: 'fa-check' }
];

// 🔴 SOLO PARA PROBAR EL DISEÑO. Se elimina cuando conectes la base de datos.
const PEDIDOS_DEMO = {
    'MC-1001': { codigo: 'MC-1001', estado: 'preparando', tipo: 'delivery', eta: 25, total: 45,
                 items: [{ nombre: '1/2 pollo a la brasa', cant: 1 }, { nombre: 'Inca Kola 1.5L', cant: 1 }] },
    'MC-1002': { codigo: 'MC-1002', estado: 'en_camino', tipo: 'delivery', eta: 10, total: 22,
                 items: [{ nombre: 'Mostrito brasa', cant: 1 }] },
    'MC-1003': { codigo: 'MC-1003', estado: 'entregado', tipo: 'recojo', eta: 0, total: 65,
                 items: [{ nombre: 'Pollo entero a la brasa', cant: 1 }] }
};

/* ---------------------------------------------------------
   3. UTILIDADES
   --------------------------------------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const money = n => `S/ ${Number(n).toFixed(2)}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const pausa = ms => new Promise(r => setTimeout(r, ms));

function a12h(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
}
function minA12h(min) {
    return a12h(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);
}

/* Día de la semana y minutos del día en hora de Lima (no depende del reloj del cliente) */
function ahoraLima() {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: CONFIG.zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = t => partes.find(p => p.type === t).value;
    const mapa = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dia: mapa[get('weekday')], min: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
}

function hoyISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toast(msg, ms = 5000) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('is-on'), ms);
}

function abrirWhatsApp(texto) {
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}

/* ---------------------------------------------------------
   4. ESTADO DEL LOCAL  🔴
   --------------------------------------------------------- */
let estadoLocal = { abierto: true };

/* Calcula el estado con CONFIG.horario. */
function calcularEstado() {
    const { dia, min } = ahoraLima();
    const h = CONFIG.horario[dia];

    if (h) {
        const abre = toMin(h.abre), cierra = toMin(h.cierra);
        if (min >= abre && min < cierra) {
            const restan = cierra - min;
            return {
                abierto: true,
                cierraPronto: restan <= 60,
                detalle: restan <= 60
                    ? `Cerramos a las ${a12h(h.cierra)} (en ${restan} min)`
                    : `Atendemos hasta las ${a12h(h.cierra)}`
            };
        }
        if (min < abre) return { abierto: false, detalle: `Abrimos hoy a las ${a12h(h.abre)}` };
    }

    for (let i = 1; i <= 7; i++) {
        const d = (dia + i) % 7;
        const sig = CONFIG.horario[d];
        if (sig) {
            return {
                abierto: false,
                detalle: i === 1
                    ? `Abrimos mañana a las ${a12h(sig.abre)}`
                    : `Abrimos el ${DIAS[d].toLowerCase()} a las ${a12h(sig.abre)}`
            };
        }
    }
    return { abierto: false, detalle: 'Por ahora no tenemos horario de atención.' };
}

/* 🔴 CONEXIÓN PHP/MySQL
   Para que el dueño pueda abrir/cerrar el local a mano o cambiar horarios desde un panel,
   reemplaza el cuerpo por:

     const r = await fetch('api/estado.php');
     const d = await r.json();
     // api/estado.php debe responder: { "abierto": true, "cierraPronto": false, "detalle": "Atendemos hasta las 11:00 p. m." }
     return d;
*/
async function obtenerEstado() {
    return calcularEstado();
}

function pintarEstado(e) {
    estadoLocal = e;
    const clave = !e.abierto ? 'cerrado' : e.cierraPronto ? 'pronto' : 'abierto';
    $$('[data-estado]').forEach(el => { el.dataset.estado = clave; });
    $$('[data-estado-label]').forEach(el => { el.textContent = e.abierto ? 'Abierto' : 'Cerrado'; });
    $$('[data-estado-extra]').forEach(el => { el.textContent = e.abierto ? ' ahora' : ''; });
    $$('[data-estado-detalle]').forEach(el => { el.textContent = e.detalle || ''; });
    $('#cart-closed-note').hidden = e.abierto;
}

async function refrescarEstado() {
    try { pintarEstado(await obtenerEstado()); }
    catch (err) { pintarEstado(calcularEstado()); } // si falla la API, se usa el horario local
}

/* 🔴 Lista de horarios (footer y sección Ubicación). Luego: datos de la tabla `horarios`. */
function renderHorarios() {
    const hoy = ahoraLima().dia;
    const html = ORDEN_DIAS.map(d => {
        const h = CONFIG.horario[d];
        const rango = h ? `${a12h(h.abre)} – ${a12h(h.cierra)}` : 'Cerrado';
        return `<li class="${d === hoy ? 'is-today' : ''}"><span>${DIAS[d]}</span><span>${rango}</span></li>`;
    }).join('');
    $$('[data-horarios]').forEach(ul => { ul.innerHTML = html; });
}

/* ---------------------------------------------------------
   5. CARTA (PRODUCTOS)  🔴
   --------------------------------------------------------- */
let productos = [];
const filtro = { cat: 'all', q: '' };

/* 🔴 CONEXIÓN PHP/MySQL
   Reemplaza el cuerpo por:

     const r = await fetch('api/productos.php');
     return await r.json();   // arreglo de { id, name, price, cat, desc, img, tag, disponible }
*/
async function cargarProductos() {
    return PRODUCTOS_DEMO;
}

const findProducto = id => productos.find(p => p.id === Number(id));

const IMG_RESPALDO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f4f4b8"/>' +
    '<text x="200" y="185" font-size="110" text-anchor="middle">🍗</text></svg>');

const IMG_RESPALDO_HERO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><text x="200" y="260" font-size="240" text-anchor="middle">🍗</text></svg>');

function controlHTML(p, qty) {
    if (!p.disponible) return '<span class="soldout">Agotado</span>';
    if (qty === 0) {
        return `<button type="button" class="btn-add" data-action="add" data-id="${p.id}" aria-label="Agregar ${esc(p.name)}">
                    <i class="fas fa-plus" aria-hidden="true"></i> Agregar</button>`;
    }
    return stepperHTML(p.id, qty, p.name);
}

function stepperHTML(id, qty, nombre, clase = '') {
    return `<div class="stepper ${clase}">
                <button type="button" data-action="dec" data-id="${id}" aria-label="Quitar uno de ${esc(nombre)}"><i class="fas fa-minus" aria-hidden="true"></i></button>
                <output aria-label="Cantidad">${qty}</output>
                <button type="button" data-action="inc" data-id="${id}" aria-label="Agregar uno más de ${esc(nombre)}"><i class="fas fa-plus" aria-hidden="true"></i></button>
            </div>`;
}

/* Estructura de cada plato. Si cambias el diseño de la tarjeta, hazlo aquí y en .card (CSS). */
function cardHTML(p) {
    return `
    <article class="card" data-id="${p.id}">
        <div class="card-media">
            <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="400" height="300">
            ${p.tag ? `<span class="card-tag glass">${esc(p.tag)}</span>` : ''}
        </div>
        <div class="card-body">
            <h3>${esc(p.name)}</h3>
            <p class="card-desc">${esc(p.desc)}</p>
            <div class="card-foot">
                <span class="price">${money(p.price)}</span>
                <div class="card-ctrl">${controlHTML(p, cart[p.id] || 0)}</div>
            </div>
        </div>
    </article>`;
}

function renderChips() {
    $('#chips').innerHTML = CATEGORIAS.map(c =>
        `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${c.id === filtro.cat}">${esc(c.nombre)}</button>`
    ).join('');
}

function renderMenu() {
    const q = norm(filtro.q.trim());
    const lista = productos.filter(p =>
        (filtro.cat === 'all' || p.cat === filtro.cat) &&
        (!q || norm(`${p.name} ${p.desc}`).includes(q))
    );
    $('#products').innerHTML = lista.map(cardHTML).join('');
    const vacio = $('#menu-empty');
    vacio.hidden = lista.length > 0;
    if (!lista.length) {
        vacio.textContent = q
            ? `No encontramos platos con "${filtro.q.trim()}". Prueba con otra palabra o elige otra categoría.`
            : 'No hay platos en esta categoría por ahora.';
    }
}

/* Actualiza solo el control (Agregar / +−) de una tarjeta, sin redibujar toda la carta */
function syncCard(id) {
    const card = $(`.card[data-id="${id}"]`);
    const p = findProducto(id);
    if (card && p) $('.card-ctrl', card).innerHTML = controlHTML(p, cart[id] || 0);
}

/* ---------------------------------------------------------
   6. PEDIDO (CARRITO + ENVÍO)  🔴
   --------------------------------------------------------- */
let cart = {};            // { idProducto: cantidad }
let ultimoFoco = null;

function cargarCarrito() {
    try { return JSON.parse(localStorage.getItem(LS_CARRITO)) || {}; }
    catch (e) { return {}; }
}
function guardarCarrito() {
    try { localStorage.setItem(LS_CARRITO, JSON.stringify(cart)); } catch (e) { /* modo privado: se ignora */ }
}

function setQty(id, q) {
    id = Number(id);
    const p = findProducto(id);
    if (!p || !p.disponible) return;
    q = Math.max(0, Math.min(99, q));
    if (q === 0) delete cart[id]; else cart[id] = q;
    guardarCarrito();
    syncCard(id);
    renderCart();
}

const tipoPedido = () => $('input[name="tipo"]:checked').value;
const pagoPedido = () => $('input[name="pago"]:checked').value;

function lineasCarrito() {
    return Object.keys(cart)
        .map(id => ({ p: findProducto(id), q: cart[id] }))
        .filter(l => l.p && l.q > 0);
}

function renderCart() {
    const lineas = lineasCarrito();
    const cantidad = lineas.reduce((s, l) => s + l.q, 0);
    const subtotal = lineas.reduce((s, l) => s + l.p.price * l.q, 0);
    const envio = cantidad && tipoPedido() === 'delivery' ? CONFIG.costoDelivery : 0;
    const total = subtotal + envio;

    $('#cart').classList.toggle('is-empty', cantidad === 0);

    $('#cart-items').innerHTML = cantidad
        ? `<ul class="ticket">${lineas.map(({ p, q }) => `
            <li class="line">
                <div>
                    <span class="line-name">${esc(p.name)}</span>
                    <span class="line-unit">${money(p.price)} c/u</span>
                </div>
                <span class="line-total">${money(p.price * q)}</span>
                ${stepperHTML(p.id, q, p.name, 'stepper-sm')}
            </li>`).join('')}</ul>`
        : `<div class="cart-empty">
               <i class="fas fa-bag-shopping" aria-hidden="true"></i>
               <p>Tu pedido está vacío. Agrega platos desde la carta.</p>
               <a class="btn btn-dark" href="#carta" data-action="close-cart">Ir a la carta</a>
           </div>`;

    $('#cart-subtotal').textContent = money(subtotal);
    $('#cart-envio').textContent = money(envio);
    $('#cart-envio-row').hidden = !(envio > 0);
    $('#cart-total').textContent = money(total);

    $$('[data-cart-count]').forEach(el => { el.textContent = cantidad; el.hidden = cantidad === 0; });
    $('[data-cart-summary]').textContent = `${cantidad} ${cantidad === 1 ? 'plato' : 'platos'}`;
    $('[data-cart-total-text]').textContent = money(total);
    $('#cart-bar').classList.toggle('is-visible', cantidad > 0 && !$('#cart').classList.contains('is-open'));
}

function actualizarCampoDireccion() {
    const delivery = tipoPedido() === 'delivery';
    $('#field-direccion').hidden = !delivery;
}

function abrirCart(opener) {
    ultimoFoco = opener || document.activeElement;
    cerrarNav();
    const cartEl = $('#cart');
    cartEl.classList.add('is-open');
    cartEl.setAttribute('aria-hidden', 'false');
    $('#overlay').classList.add('is-on');
    $('#cart-bar').classList.remove('is-visible');
    document.body.classList.add('no-scroll');
    setTimeout(() => $('.round-btn', cartEl).focus(), 50);
}

function cerrarCart() {
    const cartEl = $('#cart');
    if (!cartEl.classList.contains('is-open')) return;
    cartEl.classList.remove('is-open');
    cartEl.setAttribute('aria-hidden', 'true');
    $('#overlay').classList.remove('is-on');
    document.body.classList.remove('no-scroll');
    renderCart();
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
}

function mostrarErrorPedido(msg, selector) {
    const err = $('#cart-error');
    err.textContent = msg;
    err.hidden = false;
    $$('#cart-form .input').forEach(i => i.removeAttribute('aria-invalid'));
    if (selector) {
        const campo = $(selector);
        campo.setAttribute('aria-invalid', 'true');
        campo.focus();
    }
}

function generarCodigo() {
    return `MC-${Math.floor(1000 + Math.random() * 9000)}`;
}

/* 🔴 CONEXIÓN PHP/MySQL
   Guardar el pedido en la base de datos y recibir el código real:

     const r = await fetch('api/pedidos.php', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(datos)   // { cliente, tipo, direccion, pago, notas, items:[{id, cant}], total }
     });
     if (!r.ok) throw new Error('No se pudo registrar el pedido');
     return await r.json();            // debe responder { "codigo": "MC-1234" }

   Importante: en PHP recalcula el total con los precios de la tabla `productos`;
   no confíes en el total que envía el navegador. */
async function registrarPedido(datos) {
    return { codigo: generarCodigo() };
}

async function enviarPedido() {
    const lineas = lineasCarrito();
    $('#cart-error').hidden = true;

    if (!lineas.length) return mostrarErrorPedido('Agrega al menos un plato para enviar tu pedido.');

    const nombre = $('#c-nombre').value.trim();
    const tipo = tipoPedido();
    const direccion = $('#c-direccion').value.trim();
    const notas = $('#c-notas').value.trim();
    const pago = pagoPedido();

    if (!nombre) return mostrarErrorPedido('Escribe tu nombre para identificar tu pedido.', '#c-nombre');
    if (tipo === 'delivery' && !direccion) return mostrarErrorPedido('Escribe tu dirección de entrega.', '#c-direccion');

    const subtotal = lineas.reduce((s, l) => s + l.p.price * l.q, 0);
    const envio = tipo === 'delivery' ? CONFIG.costoDelivery : 0;
    const total = subtotal + envio;

    const btn = $('#btn-enviar');
    btn.disabled = true;

    try {
        const { codigo } = await registrarPedido({
            cliente: nombre, tipo, direccion, pago, notas, total,
            items: lineas.map(l => ({ id: l.p.id, cant: l.q }))
        });

        const msg = [
            `*Pedido Mac Chicken* (${codigo})`,
            '',
            ...lineas.map(l => `- ${l.p.name} x${l.q}  (${money(l.p.price * l.q)})`),
            '',
            envio > 0 ? `Delivery: ${money(envio)}` : null,
            `*Total:* ${money(total)}`,
            '',
            `*Cliente:* ${nombre}`,
            `*Tipo:* ${tipo === 'delivery' ? 'Delivery' : 'Recojo en local'}`,
            tipo === 'delivery' ? `*Dirección:* ${direccion}` : null,
            `*Pago:* ${pago}`,
            notas ? `*Indicaciones:* ${notas}` : null
        ].filter(l => l !== null).join('\n');

        abrirWhatsApp(msg);

        try { localStorage.setItem(LS_ULTIMO, codigo); } catch (e) { /* se ignora */ }
        cart = {};
        guardarCarrito();
        renderMenu();
        renderCart();
        cerrarCart();
        toast(`Pedido enviado. Tu código es ${codigo}. Guárdalo para seguirlo.`, 7000);
    } catch (err) {
        mostrarErrorPedido('No pudimos registrar tu pedido. Inténtalo de nuevo o escríbenos por WhatsApp.');
    } finally {
        btn.disabled = false;
    }
}

/* ---------------------------------------------------------
   7. RESERVA DE MESA  🔴
   --------------------------------------------------------- */
const modalReserva = () => $('#modal-reserva');

function prepararReserva() {
    const sel = $('#r-personas');
    sel.innerHTML = Array.from({ length: 12 }, (_, i) =>
        `<option value="${i + 1}">${i + 1} ${i === 0 ? 'persona' : 'personas'}</option>`).join('');
    sel.value = '2';
    $('#r-fecha').min = hoyISO();
}

function actualizarHoras() {
    const fecha = $('#r-fecha').value;
    const sel = $('#r-hora');
    const msg = $('#r-msg');
    msg.textContent = '';

    if (!fecha) {
        sel.innerHTML = '<option value="">Elige primero la fecha</option>';
        sel.disabled = true;
        return;
    }

    const dia = new Date(`${fecha}T12:00:00`).getDay();
    const h = CONFIG.horario[dia];

    if (!h) {
        sel.innerHTML = '<option value="">Sin horarios</option>';
        sel.disabled = true;
        msg.textContent = `Los ${DIAS[dia].toLowerCase()} no atendemos. Elige otro día.`;
        return;
    }

    const minAhora = ahoraLima().min + 30; // margen para reservas de hoy
    const esHoy = fecha === hoyISO();
    const opciones = [];
    for (let m = toMin(h.abre); m <= toMin(h.cierra) - CONFIG.maxHorasReserva; m += 30) {
        if (esHoy && m < minAhora) continue;
        const hh = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        opciones.push(`<option value="${hh}">${minA12h(m)}</option>`);
    }

    if (!opciones.length) {
        sel.innerHTML = '<option value="">Sin horarios</option>';
        sel.disabled = true;
        msg.textContent = 'Ya no quedan horarios para hoy. Elige otra fecha.';
        return;
    }
    sel.innerHTML = opciones.join('');
    sel.disabled = false;
}

/* 🔴 CONEXIÓN PHP/MySQL (opcional)
   Guardar la reserva en la base de datos:

     const r = await fetch('api/reservas.php', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(datos)  // { nombre, telefono, fecha, hora, personas, notas }
     });
     if (!r.ok) throw new Error('No se pudo registrar la reserva');
     return await r.json();
*/
async function registrarReserva(datos) {
    return { ok: true };
}

async function enviarReserva(e) {
    e.preventDefault();
    const err = $('#r-error');
    err.hidden = true;

    const datos = {
        nombre: $('#r-nombre').value.trim(),
        telefono: $('#r-tel').value.trim(),
        fecha: $('#r-fecha').value,
        hora: $('#r-hora').value,
        personas: $('#r-personas').value,
        notas: $('#r-notas').value.trim()
    };

    const fallo = (m) => { err.textContent = m; err.hidden = false; };
    if (!datos.nombre) return fallo('Escribe tu nombre.');
    if (!/^[0-9+\s-]{7,15}$/.test(datos.telefono)) return fallo('Escribe un número de celular válido.');
    if (!datos.fecha) return fallo('Elige la fecha de tu reserva.');
    if (!datos.hora) return fallo('Elige una hora disponible.');

    try {
        await registrarReserva(datos);
        const fechaTxt = new Date(`${datos.fecha}T12:00:00`)
            .toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
        const msg = [
            '*Reserva de mesa Mac Chicken*',
            '',
            `*Nombre:* ${datos.nombre}`,
            `*Celular:* ${datos.telefono}`,
            `*Fecha:* ${fechaTxt}`,
            `*Hora:* ${a12h(datos.hora)}`,
            `*Personas:* ${datos.personas}`,
            datos.notas ? `*Comentarios:* ${datos.notas}` : null
        ].filter(l => l !== null).join('\n');

        abrirWhatsApp(msg);
        modalReserva().close();
        $('#reserva-form').reset();
        prepararReserva();
        actualizarHoras();
        toast('Abrimos WhatsApp para confirmar tu reserva.');
    } catch (error) {
        fallo('No pudimos registrar tu reserva. Inténtalo de nuevo o escríbenos por WhatsApp.');
    }
}

/* ---------------------------------------------------------
   8. SEGUIMIENTO DE PEDIDO  🔴
   --------------------------------------------------------- */
let codigoActual = null;
let temporizadorTrack = null;

function normalizarCodigo(v) {
    v = v.trim().toUpperCase().replace(/\s+/g, '');
    if (/^\d+$/.test(v)) v = `MC-${v}`;
    if (/^MC\d+$/.test(v)) v = v.replace('MC', 'MC-');
    return v;
}

/* 🔴 CONEXIÓN PHP/MySQL
   Reemplaza el cuerpo por:

     const r = await fetch('api/pedido.php?codigo=' + encodeURIComponent(codigo));
     if (r.status === 404) return null;
     if (!r.ok) throw new Error('Error de servidor');
     return await r.json();

   api/pedido.php debe responder exactamente con esta forma:
     {
       "codigo": "MC-1001",
       "estado": "preparando",        // recibido | preparando | en_camino | entregado
       "tipo": "delivery",            // delivery | recojo
       "eta": 25,                     // minutos estimados (0 o null si no aplica)
       "total": 45.00,
       "actualizado": "2026-10-09T18:30:00-05:00",
       "items": [ { "nombre": "1/2 pollo a la brasa", "cant": 1 } ]
     }
   Para que el estado cambie "en vivo", basta con que el local actualice la columna
   `estado` en MySQL: esta pantalla vuelve a consultar cada 30 segundos. */
async function buscarPedido(codigo) {
    await pausa(350);
    const p = PEDIDOS_DEMO[codigo];
    return p ? { ...p, actualizado: new Date().toISOString() } : null;
}

function renderPedido(p) {
    const ultimo = ESTADOS_PEDIDO.length - 1;
    const idx = Math.max(0, ESTADOS_PEDIDO.findIndex(s => s.id === p.estado));
    const entregado = idx === ultimo;

    const pasos = ESTADOS_PEDIDO.map((s, i) => {
        let titulo = s.titulo, desc = s.desc;
        if (p.tipo === 'recojo' && s.id === 'en_camino') { titulo = 'Listo para recoger'; desc = 'Te esperamos en el local.'; }
        if (p.tipo === 'recojo' && s.id === 'entregado') { desc = 'Gracias por venir.'; }
        const clase = (i < idx || entregado) ? 'is-done' : i === idx ? 'is-current' : 'is-todo';
        const icono = clase === 'is-done' ? 'fa-check' : s.icono;
        return `<li class="tl-step ${clase}">
                    <span class="tl-dot"><i class="fas ${icono}" aria-hidden="true"></i></span>
                    <div><div class="tl-title">${esc(titulo)}</div><div class="tl-desc">${esc(desc)}</div></div>
                </li>`;
    }).join('');

    const etapa = ESTADOS_PEDIDO[idx];
    const etapaTxt = p.tipo === 'recojo' && etapa.id === 'en_camino' ? 'Listo para recoger' : etapa.titulo;
    const eta = entregado
        ? 'Pedido entregado. Gracias por elegirnos.'
        : p.eta ? `Tiempo estimado: ${p.eta} min` : 'Estamos actualizando el tiempo estimado.';
    const hora = new Date(p.actualizado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: CONFIG.zona });

    $('#track-result').innerHTML = `
        <div class="track-card">
            <div class="track-head">
                <div>
                    <p class="track-code">${esc(p.codigo)}</p>
                    <p class="track-sub">${p.tipo === 'delivery' ? 'Delivery' : 'Recojo en local'}</p>
                </div>
                <span class="pill ${entregado ? 'is-done' : ''}">${esc(etapaTxt)}</span>
            </div>
            <p class="track-eta">${esc(eta)}</p>
            <ol class="timeline">${pasos}</ol>
            <ul class="track-items">
                ${(p.items || []).map(i => `<li><span>${esc(i.nombre)} x${Number(i.cant)}</span></li>`).join('')}
            </ul>
            <div class="track-total"><span>Total</span><span>${money(p.total)}</span></div>
            <p class="track-updated">Actualizado a las ${esc(hora)}</p>
        </div>`;
}

async function consultarPedido(codigoCrudo, silencioso = false) {
    const codigo = normalizarCodigo(codigoCrudo);
    const caja = $('#track-result');
    if (!codigo) {
        caja.innerHTML = '<p class="track-msg">Escribe el código de tu pedido. Tiene el formato MC-1234.</p>';
        return;
    }
    if (!silencioso) caja.innerHTML = '<p class="track-loading">Buscando tu pedido…</p>';

    try {
        const pedido = await buscarPedido(codigo);
        if (!pedido) {
            codigoActual = null;
            caja.innerHTML = `<p class="track-msg">No encontramos el pedido ${esc(codigo)}. Revisa el código en tu mensaje de WhatsApp o escríbenos.</p>`;
            return;
        }
        codigoActual = codigo;
        renderPedido(pedido);
    } catch (err) {
        if (!silencioso) caja.innerHTML = '<p class="track-msg">No pudimos consultar tu pedido en este momento. Inténtalo de nuevo en unos segundos.</p>';
    }
}

function abrirTrack(opener) {
    const dlg = $('#modal-track');
    const ultimo = (() => { try { return localStorage.getItem(LS_ULTIMO); } catch (e) { return null; } })();
    const btn = $('#track-last');
    if (ultimo) {
        btn.hidden = false;
        btn.textContent = `Ver mi último pedido (${ultimo})`;
        btn.dataset.codigo = ultimo;
    } else {
        btn.hidden = true;
    }
    dlg.showModal();
    clearInterval(temporizadorTrack);
    temporizadorTrack = setInterval(() => { if (codigoActual) consultarPedido(codigoActual, true); }, 30000);
}

/* ---------------------------------------------------------
   9. NAVEGACIÓN, MODALES Y EVENTOS
   --------------------------------------------------------- */
function cerrarNav() {
    $('#main-nav').classList.remove('is-open');
    const b = $('#burger');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', 'Abrir menú');
}

function alternarNav() {
    const abierto = $('#main-nav').classList.toggle('is-open');
    const b = $('#burger');
    b.setAttribute('aria-expanded', String(abierto));
    b.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
}

function atraparFoco(e) {
    const f = $$('button:not([disabled]), a[href], input:not([disabled]), textarea, select', $('#cart'))
        .filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
}

function registrarEventos() {
    /* Acciones por data-action (carta, pedido, modales, menú) */
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const accion = el.dataset.action;
        const id = el.dataset.id;

        if (accion !== 'toggle-nav') cerrarNav();

        switch (accion) {
            case 'add':          setQty(id, 1); break;
            case 'inc':          setQty(id, (cart[id] || 0) + 1); break;
            case 'dec':          setQty(id, (cart[id] || 0) - 1); break;
            case 'open-cart':    abrirCart(el); break;
            case 'close-cart':   cerrarCart(); break;
            case 'open-reserva': modalReserva().showModal(); break;
            case 'open-track':   abrirTrack(el); break;
            case 'close-modal':  el.closest('dialog').close(); break;
            case 'toggle-nav':   alternarNav(); break;
        }
    });

    /* Menú móvil: se cierra al tocar un enlace */
    $('#main-nav').addEventListener('click', e => { if (e.target.closest('a')) cerrarNav(); });

    /* Filtros de la carta */
    $('#chips').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        filtro.cat = chip.dataset.cat;
        $$('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
        renderMenu();
    });
    $('#search').addEventListener('input', e => { filtro.q = e.target.value; renderMenu(); });

    /* Pedido */
    $('#cart-form').addEventListener('submit', e => { e.preventDefault(); enviarPedido(); });
    $$('input[name="tipo"]').forEach(r => r.addEventListener('change', () => { actualizarCampoDireccion(); renderCart(); }));
    $('#cart-form').addEventListener('input', () => { $('#cart-error').hidden = true; });

    /* Reserva */
    $('#r-fecha').addEventListener('change', actualizarHoras);
    $('#reserva-form').addEventListener('submit', enviarReserva);

    /* Seguimiento */
    $('#track-form').addEventListener('submit', e => { e.preventDefault(); consultarPedido($('#t-codigo').value); });
    $('#track-last').addEventListener('click', e => {
        const c = e.currentTarget.dataset.codigo;
        $('#t-codigo').value = c;
        consultarPedido(c);
    });
    $('#modal-track').addEventListener('close', () => { clearInterval(temporizadorTrack); codigoActual = null; });

    /* Cerrar modales al tocar el fondo */
    $$('.modal').forEach(dlg => dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }));

    /* Teclado */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { cerrarCart(); cerrarNav(); }
        if (e.key === 'Tab' && $('#cart').classList.contains('is-open')) atraparFoco(e);
    });

    /* Si se agranda la pantalla, cerrar el menú móvil */
    window.matchMedia('(min-width: 900px)').addEventListener('change', cerrarNav);

    /* Imagen de respaldo si una foto no carga */
    document.addEventListener('error', e => {
        const img = e.target;
        if (img.tagName === 'IMG' && img.closest('.card-media, .hero-photo') && !img.dataset.respaldo) {
            img.dataset.respaldo = '1';
            img.src = img.closest('.hero-photo') ? IMG_RESPALDO_HERO : IMG_RESPALDO;
        }
    }, true);
    $$('.hero-photo img').forEach(img => {
        if (img.complete && img.naturalWidth === 0) { img.dataset.respaldo = '1'; img.src = IMG_RESPALDO_HERO; }
    });
}

/* ---------------------------------------------------------
   10. INICIO
   --------------------------------------------------------- */
async function iniciar() {
    cart = cargarCarrito();
    registrarEventos();
    renderHorarios();
    prepararReserva();
    actualizarHoras();
    actualizarCampoDireccion();

    try {
        productos = await cargarProductos();
    } catch (err) {
        productos = PRODUCTOS_DEMO; // si falla la API, se muestra la carta de respaldo
    }

    // Quita del pedido guardado los platos que ya no existen o no están disponibles
    Object.keys(cart).forEach(id => { const p = findProducto(id); if (!p || !p.disponible) delete cart[id]; });
    guardarCarrito();

    renderChips();
    renderMenu();
    renderCart();

    await refrescarEstado();
    setInterval(refrescarEstado, 60000); // el estado se revisa cada minuto
}

iniciar();