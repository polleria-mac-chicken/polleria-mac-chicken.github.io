/* =========================================================
   MAC CHICKEN — admin.js
   Lógica del panel de administración.

   ORDEN DEL ARCHIVO
   1. Utilidades y llamadas al servidor
   2. Pestañas
   3. Estado del local (interruptor Abierto / Cerrado)
   4. Sonido y avisos de nuevos pedidos
   5. Pedidos en vivo (se actualiza cada 5 s)
   6. Carta (crear, editar, activar, eliminar)
   7. Reservas
   8. Ajustes (horario, delivery, contraseña)
   9. Inicio
   ========================================================= */
'use strict';

(() => {
    /* ---------------------------------------------------------
       1. UTILIDADES Y LLAMADAS AL SERVIDOR
       --------------------------------------------------------- */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = n => `S/ ${Number(n).toFixed(2)}`;

    /* 🔴 Datos del negocio para el ticket impreso. Completa tu RUC real antes de imprimir. */
    const NEGOCIO = {
        nombre: 'MAC CHICKEN',
        ruc: 'RUC: completar en admin.js (const NEGOCIO)',
        direccion: 'Km 4.5 Carretera Pimentel (Cruce Colegio Algarrobos), Chiclayo',
    };
    const CSRF = $('meta[name="csrf-token"]').content;
    const HOY = document.body.dataset.hoy;

    /* Llama a admin_acciones.php. Con `form` envía un FormData (para subir la foto del plato). */
    async function api(accion, datos = {}, form = null) {
        const opts = { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } };
        if (form) {
            opts.body = form;
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify({ accion, ...datos });
        }
        const r = await fetch('admin_acciones.php', opts);
        let d = {};
        try { d = await r.json(); } catch (e) { /* respuesta no JSON */ }
        if (r.status === 401) { location.href = 'login.php'; throw new Error('Tu sesión expiró.'); }
        if (!r.ok) throw new Error(d.error || 'No se pudo completar la acción.');
        return d;
    }

    let toastTimer = null;
    function toast(msg, tipo = 'ok', ms = 4000, alClic = null) {
        const t = $('#toast');
        t.textContent = msg;
        t.className = `toast is-on is-${tipo}`;
        t.onclick = alClic ? () => { alClic(); t.classList.remove('is-on'); } : null;
        t.style.cursor = alClic ? 'pointer' : '';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
    }

    /* Mensaje que sobrevive a un location.reload() */
    function recargarConMensaje(msg) {
        try { sessionStorage.setItem('mc_flash', msg); } catch (e) { /* se ignora */ }
        location.reload();
    }

    function confirmar(titulo, texto, botonSi = 'Eliminar') {
        return new Promise(resolver => {
            const dlg = $('#dlg-confirmar');
            $('#conf-titulo').textContent = titulo;
            $('#conf-texto').textContent = texto;
            $('#conf-si').textContent = botonSi;
            const fin = valor => { dlg.close(); resolver(valor); };
            $('#conf-si').onclick = () => fin(true);
            $('#conf-no').onclick = () => fin(false);
            dlg.addEventListener('cancel', () => resolver(false), { once: true });
            dlg.showModal();
        });
    }

    const digitos = tel => String(tel || '').replace(/\D+/g, '');
    const numWA = tel => { const d = digitos(tel); return d.length === 9 ? `51${d}` : d; };

    /* ---------------------------------------------------------
       2. PESTAÑAS
       --------------------------------------------------------- */
    const TABS = ['pedidos', 'carta', 'reservas', 'ventas', 'ajustes'];

    function irTab(nombre) {
        if (!TABS.includes(nombre)) nombre = 'pedidos';
        $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === nombre)));
        $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== nombre; });
        history.replaceState(null, '', `${location.pathname}${location.search}#${nombre}`);
        window.scrollTo({ top: 0 });
    }

    /* ---------------------------------------------------------
       3. ESTADO DEL LOCAL
       --------------------------------------------------------- */
    const sw = $('#sw-local');
    const TXT_MODO = { auto: 'Automático, según el horario', abierto: 'Manual: abierto', cerrado: 'Manual: cerrado' };

    function pintarLocal(estado) {
        sw.checked = estado.abierto;
        $('#local-label').textContent = estado.abierto ? 'Abierto' : 'Cerrado';
        $('#local-modo').textContent = TXT_MODO[estado.modo] || '';
        $('#local-control').dataset.modo = estado.modo;
        $('#btn-auto').hidden = estado.modo === 'auto';
    }

    sw.addEventListener('change', async () => {
        const quiereAbrir = sw.checked;
        sw.disabled = true;
        try {
            const d = await api('local_modo', { modo: quiereAbrir ? 'abierto' : 'cerrado' });
            pintarLocal(d.estado);
            toast(quiereAbrir
                ? 'Local abierto. Los clientes ya pueden pedir.'
                : 'Local cerrado. La página muestra “Cerrado” hasta que lo abras.');
        } catch (err) {
            sw.checked = !quiereAbrir;
            toast(err.message, 'error');
        } finally {
            sw.disabled = false;
        }
    });

    $('#btn-auto').addEventListener('click', async () => {
        try {
            const d = await api('local_modo', { modo: 'auto' });
            pintarLocal(d.estado);
            toast('Listo. El local abre y cierra solo según el horario.');
        } catch (err) { toast(err.message, 'error'); }
    });

    /* ---------------------------------------------------------
       4. SONIDO Y AVISOS
       Los navegadores no dejan sonar nada hasta que la persona toca
       la pantalla una vez, por eso aparece el aviso amarillo al entrar.
       --------------------------------------------------------- */
    let audioCtx = null;
    let sonidoOn = (() => { try { return localStorage.getItem('mc_sonido') !== '0'; } catch (e) { return true; } })();

    function pintarBotonSonido() {
        const b = $('#btn-sonido');
        b.setAttribute('aria-pressed', String(sonidoOn));
        b.setAttribute('aria-label', `Sonido de nuevos pedidos: ${sonidoOn ? 'activado' : 'silenciado'}`);
        $('i', b).className = `fas ${sonidoOn ? 'fa-bell' : 'fa-bell-slash'}`;
    }

    function desbloquearAudio() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        $('#sound-note').hidden = true;
    }

    function pedirPermisoNotificaciones() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }

    function campanilla() {
        if (!sonidoOn || !audioCtx || audioCtx.state !== 'running') return;
        const t0 = audioCtx.currentTime;
        [[880, 0], [1175, 0.18], [880, 0.6], [1175, 0.78]].forEach(([freq, d]) => {
            const osc = audioCtx.createOscillator();
            const gan = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gan.gain.setValueAtTime(0.0001, t0 + d);
            gan.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
            gan.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.42);
            osc.connect(gan).connect(audioCtx.destination);
            osc.start(t0 + d);
            osc.stop(t0 + d + 0.46);
        });
    }

    /* Cualquier primer toque en la página habilita el audio */
    ['pointerdown', 'keydown'].forEach(ev =>
        document.addEventListener(ev, () => { if (!audioCtx || audioCtx.state !== 'running') desbloquearAudio(); }, { once: false, passive: true }));

    $('#sound-note').addEventListener('click', () => { desbloquearAudio(); pedirPermisoNotificaciones(); campanilla(); });

    $('#btn-sonido').addEventListener('click', () => {
        sonidoOn = !sonidoOn;
        try { localStorage.setItem('mc_sonido', sonidoOn ? '1' : '0'); } catch (e) { /* se ignora */ }
        pintarBotonSonido();
        if (sonidoOn) { desbloquearAudio(); pedirPermisoNotificaciones(); campanilla(); }
        toast(sonidoOn ? 'Aviso sonoro activado.' : 'Aviso sonoro silenciado. Seguirás viendo los avisos en pantalla.');
    });

    function avisarNuevosPedidos(lista) {
        const p = lista[0];
        const texto = lista.length === 1
            ? `Nuevo pedido ${p.codigo} de ${p.cliente} por ${money(p.total)}`
            : `Llegaron ${lista.length} pedidos nuevos`;
        toast(texto, 'alert', 9000, () => irTab('pedidos'));
        campanilla();
        if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification('Nuevo pedido en Mac Chicken', { body: texto, tag: 'mc-pedido' }); } catch (e) { /* se ignora */ }
        }
    }

    /* ---------------------------------------------------------
       5. PEDIDOS EN VIVO
       --------------------------------------------------------- */
    const ESTADOS = ['pendiente', 'en proceso', 'en camino', 'entregado'];
    const ETAS = [10, 15, 20, 25, 30, 40, 45, 60];
    const TITULO_PAGINA = document.title;

    let ultimoId = null;          // mayor id de pedido ya visto (null = primera carga)
    let firmaActual = '';
    let reservasPrevias = null;
    let pendientesActuales = 0;
    let fallos = 0;
    const idsNuevos = new Set();

    const etiquetaEstado = (p, e) => (e === 'en camino' && p.tipo === 'recojo')
        ? 'Listo para recoger'
        : { 'pendiente': 'Pendiente', 'en proceso': 'En preparación', 'en camino': 'En camino', 'entregado': 'Entregado' }[e];

    function textoAvanzar(p) {
        switch (p.estado) {
            case 'pendiente':  return { icono: 'fa-fire-burner', txt: 'Empezar a preparar' };
            case 'en proceso': return p.tipo === 'delivery'
                ? { icono: 'fa-motorcycle', txt: 'Salió a entregar' }
                : { icono: 'fa-bag-shopping', txt: 'Listo para recoger' };
            case 'en camino':  return { icono: 'fa-check', txt: p.tipo === 'delivery' ? 'Marcar entregado' : 'Entregado al cliente' };
            default: return null;
        }
    }

    const hace = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;

    function comandaHTML(p) {
        const avanzar = textoAvanzar(p);
        const tarde = p.estado === 'pendiente' && p.minutos >= 10;
        const tel = digitos(p.telefono);

        const opcionesEstado = ESTADOS.map(e =>
            `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${esc(etiquetaEstado(p, e))}</option>`).join('');

        const etas = ETAS.includes(p.eta) || p.eta === null ? ETAS : [...ETAS, p.eta].sort((a, b) => a - b);
        const opcionesEta = `<option value="">Tiempo: sin definir</option>` +
            etas.map(m => `<option value="${m}" ${m === p.eta ? 'selected' : ''}>${m} min</option>`).join('');

        return `
        <article class="comanda ${idsNuevos.has(p.id) ? 'is-new' : ''}" data-id="${p.id}" data-estado="${esc(p.estado)}" data-pedido="${esc(JSON.stringify(p))}">
            <div class="cmd-head">
                <span class="cmd-code">${esc(p.codigo)}</span>
                <span class="cmd-age ${tarde ? 'is-late' : ''}" title="Hora del pedido: ${esc(p.hora)}"><i class="fas fa-clock" aria-hidden="true"></i> ${hace(p.minutos)}</span>
            </div>

            <div class="cmd-who">
                <strong>${esc(p.cliente)}</strong>
                ${tel ? `<span><a href="tel:+${numWA(p.telefono)}"><i class="fas fa-phone" aria-hidden="true"></i> ${esc(p.telefono)}</a>
                         · <a href="https://wa.me/${numWA(p.telefono)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp" aria-hidden="true"></i> WhatsApp</a></span>` : ''}
                ${p.direccion ? `<span><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(p.direccion)}</span>` : ''}
            </div>

            <div class="cmd-meta">
                <span class="tag">${p.tipo === 'delivery' ? 'Delivery' : 'Recojo en local'}</span>
                <span class="tag tag-yellow">${esc(p.pago.charAt(0).toUpperCase() + p.pago.slice(1))}</span>
            </div>

            <ul class="cmd-items">
                ${p.items.map(i => `<li><b>${i.cant}×</b><span>${esc(i.nombre)}</span></li>`).join('')}
            </ul>
            ${p.notas ? `<p class="cmd-note"><i class="fas fa-comment-dots" aria-hidden="true"></i> ${esc(p.notas)}</p>` : ''}

            <div class="cmd-total">
                <span>${p.pago === 'efectivo' ? 'Cobrar en efectivo' : 'Total'}${p.envio > 0 ? ` (incl. delivery ${money(p.envio)})` : ''}</span>
                <strong>${money(p.total)}</strong>
            </div>

            <div class="cmd-actions">
                ${avanzar ? `<button type="button" class="btn btn-dark" data-accion="avanzar"><i class="fas ${avanzar.icono}" aria-hidden="true"></i> ${avanzar.txt}</button>` : ''}
                <button type="button" class="btn btn-ghost" data-accion="imprimir"><i class="fas fa-print" aria-hidden="true"></i> Imprimir ticket</button>
                <div class="cmd-extra">
                    <select class="input" data-accion="pedido-estado" aria-label="Cambiar estado de ${esc(p.codigo)}">${opcionesEstado}</select>
                    ${p.estado !== 'entregado'
                        ? `<select class="input" data-accion="pedido-eta" aria-label="Tiempo estimado de ${esc(p.codigo)}">${opcionesEta}</select>`
                        : '<span></span>'}
                </div>
            </div>
        </article>`;
    }

    function pintarPedidos(d) {
        const porEstado = { 'pendiente': [], 'en proceso': [], 'en camino': [], 'entregado': d.entregados };
        d.activos.forEach(p => porEstado[p.estado].push(p));

        $$('.col', $('#board')).forEach(col => {
            const lista = porEstado[col.dataset.col] || [];
            $('[data-count]', col).textContent = lista.length;
            $('[data-body]', col).innerHTML = lista.length
                ? lista.map(comandaHTML).join('')
                : `<p class="col-empty">${col.dataset.col === 'pendiente' ? 'No hay pedidos nuevos.' : 'Nada por aquí.'}</p>`;
        });
    }

    function pintarResumen(d) {
        const pend = d.activos.filter(p => p.estado === 'pendiente').length;
        const curso = d.activos.length - pend;
        pendientesActuales = pend;

        $('#k-hoy').textContent = d.pedidos_hoy;
        $('#k-ventas').textContent = money(d.ventas_hoy);
        $('#k-pend').textContent = pend;
        $('#k-curso').textContent = curso;
        $('#k-pend-box').classList.toggle('has-pending', pend > 0);

        const badge = $('#badge-pedidos');
        badge.textContent = pend;
        badge.hidden = pend === 0;
        document.title = pend > 0 ? `(${pend}) Pedidos sin atender | Mac Chicken` : TITULO_PAGINA;
    }

    function procesarPedidos(d) {
        // ¿Hay pedidos que no habíamos visto?
        if (ultimoId !== null) {
            const nuevos = d.activos.filter(p => p.id > ultimoId);
            if (nuevos.length) {
                nuevos.forEach(p => idsNuevos.add(p.id));
                setTimeout(() => nuevos.forEach(p => idsNuevos.delete(p.id)), 9000);
                avisarNuevosPedidos(nuevos);
            }
        }
        ultimoId = Math.max(ultimoId ?? 0, d.max_id);

        // ¿Reservas nuevas por confirmar?
        if (reservasPrevias !== null && d.reservas_pendientes > reservasPrevias) {
            toast('Hay una reserva nueva por confirmar.', 'alert', 9000, () => { irTab('reservas'); location.reload(); });
            campanilla();
        }
        reservasPrevias = d.reservas_pendientes;
        const bR = $('#badge-reservas');
        bR.textContent = d.reservas_pendientes;
        bR.hidden = d.reservas_pendientes === 0;

        pintarResumen(d);

        // No redibujar mientras alguien está usando un selector de una comanda
        const foco = document.activeElement;
        if (foco && foco.closest && foco.closest('#board') && /^(SELECT|INPUT)$/.test(foco.tagName)) return;

        const firma = JSON.stringify([d.activos, d.entregados, [...idsNuevos]]);
        if (firma !== firmaActual) {
            firmaActual = firma;
            pintarPedidos(d);
        }
    }

    async function cargarPedidos() {
        try {
            const r = await fetch('admin_acciones.php?accion=pedidos', { cache: 'no-store', credentials: 'same-origin' });
            if (r.status === 401) { location.href = 'login.php'; return; }
            if (!r.ok) throw new Error('servidor');
            procesarPedidos(await r.json());
            fallos = 0;
            $('#conn-note').hidden = true;
        } catch (err) {
            fallos++;
            if (fallos >= 2) $('#conn-note').hidden = false;
        }
    }

    function programarPedidos() {
        cargarPedidos().finally(() => setTimeout(programarPedidos, 5000));
    }

    $('#board').addEventListener('click', async e => {
        const btnImprimir = e.target.closest('[data-accion="imprimir"]');
        if (btnImprimir) {
            const card = btnImprimir.closest('.comanda');
            imprimirTicket(JSON.parse(card.dataset.pedido));
            return;
        }

        const btn = e.target.closest('[data-accion="avanzar"]');
        if (!btn) return;
        const card = btn.closest('.comanda');
        const idx = ESTADOS.indexOf(card.dataset.estado);
        if (idx < 0 || idx >= ESTADOS.length - 1) return;
        btn.disabled = true;
        try {
            await api('pedido_estado', { id: Number(card.dataset.id), estado: ESTADOS[idx + 1] });
            firmaActual = '';
            await cargarPedidos();
        } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
        }
    });

    /* ---------------------------------------------------------
       5b. IMPRIMIR TICKET (impresora térmica 58/80mm)
       El HTML se arma en #print-ticket (oculto en pantalla) y solo ese
       bloque se hace visible durante la impresión gracias al @media print
       de admin.css (reglas .is-imprimiendo-ticket). El precio ya incluye
       IGV (como en la carta), así que aquí solo se desglosa para el ticket;
       no cambia nada de lo que paga el cliente. Es un comprobante interno,
       no un documento SUNAT: ver notas de "Fase SUNAT" en script.sql.
       --------------------------------------------------------- */
    function imprimirTicket(p) {
        const opGravada = p.total / 1.18;
        const igv = p.total - opGravada;

        const html = `
            <div class="ticket-negocio">
                <strong>${esc(NEGOCIO.nombre)}</strong>
                <span>${esc(NEGOCIO.ruc)}</span>
                <span>${esc(NEGOCIO.direccion)}</span>
            </div>
            <div class="ticket-linea"></div>
            <div class="ticket-fila"><span>Pedido</span><strong>${esc(p.codigo)}</strong></div>
            <div class="ticket-fila"><span>Fecha</span><span>${esc(p.fecha)} ${esc(p.hora)}</span></div>
            <div class="ticket-fila"><span>Tipo</span><span>${p.tipo === 'delivery' ? 'Delivery' : 'Recojo en local'}</span></div>
            <div class="ticket-linea"></div>
            <div class="ticket-fila"><span>Cliente</span><span>${esc(p.cliente)}</span></div>
            ${p.telefono ? `<div class="ticket-fila"><span>Celular</span><span>${esc(p.telefono)}</span></div>` : ''}
            ${p.direccion ? `<div class="ticket-fila"><span>Dirección</span><span>${esc(p.direccion)}</span></div>` : ''}
            <div class="ticket-linea"></div>
            <table class="ticket-items">
                <thead><tr><th>Cant.</th><th>Producto</th><th>P. Unit.</th><th>Subt.</th></tr></thead>
                <tbody>
                    ${p.items.map(i => `<tr>
                        <td>${i.cant}</td>
                        <td>${esc(i.nombre)}</td>
                        <td>${money(i.precio)}</td>
                        <td>${money(i.subtotal)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="ticket-linea"></div>
            ${p.notas ? `<p class="ticket-notas">${esc(p.notas)}</p>` : ''}
            <div class="ticket-fila"><span>Op. gravada</span><span>${money(opGravada)}</span></div>
            <div class="ticket-fila"><span>IGV (18%)</span><span>${money(igv)}</span></div>
            ${p.envio > 0 ? `<div class="ticket-fila"><span>Delivery</span><span>${money(p.envio)}</span></div>` : ''}
            <div class="ticket-fila ticket-total"><span>TOTAL</span><span>${money(p.total)}</span></div>
            <div class="ticket-fila"><span>Pago</span><span>${esc(p.pago.charAt(0).toUpperCase() + p.pago.slice(1))}</span></div>
            <div class="ticket-linea"></div>
            <p class="ticket-pie">¡Gracias por tu compra!</p>`;

        $('#print-ticket').innerHTML = html;
        document.body.classList.add('is-imprimiendo-ticket');
        window.print();
    }

    window.addEventListener('afterprint', () => {
        document.body.classList.remove('is-imprimiendo-ticket');
    });

    $('#board').addEventListener('change', async e => {
        const sel = e.target.closest('select[data-accion]');
        if (!sel) return;
        const id = Number(sel.closest('.comanda').dataset.id);
        try {
            if (sel.dataset.accion === 'pedido-estado') {
                await api('pedido_estado', { id, estado: sel.value });
            } else {
                await api('pedido_eta', { id, eta: sel.value === '' ? null : Number(sel.value) });
                toast(sel.value ? `Tiempo estimado: ${sel.value} min. El cliente ya lo ve.` : 'Quitaste el tiempo estimado.');
            }
            sel.blur();
            firmaActual = '';
            await cargarPedidos();
        } catch (err) {
            toast(err.message, 'error');
            firmaActual = '';
            cargarPedidos();
        }
    });

    /* Recordatorio: mientras haya pedidos sin atender, suena cada 30 s */
    setInterval(() => { if (pendientesActuales > 0) campanilla(); }, 30000);

    /* ---------------------------------------------------------
       6. CARTA
       --------------------------------------------------------- */
    const dlgProd = $('#dlg-producto');
    const formProd = $('#form-producto');
    const filtroCarta = { cat: 'all', q: '' };

    function filtrarCarta() {
        const q = filtroCarta.q.trim().toLowerCase();
        let visibles = 0;
        $$('#prod-grid .prod').forEach(el => {
            const ok = (filtroCarta.cat === 'all' || el.dataset.cat === filtroCarta.cat) && (!q || el.dataset.nombre.includes(q));
            el.hidden = !ok;
            if (ok) visibles++;
        });
        $('#carta-vacio').hidden = visibles > 0;
    }

    $('#carta-chips').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        filtroCarta.cat = chip.dataset.cat;
        $$('#carta-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
        filtrarCarta();
    });
    $('#carta-buscar').addEventListener('input', e => { filtroCarta.q = e.target.value; filtrarCarta(); });

    function vistaPrevia(src) {
        $('#pr-preview').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>🍗</span>';
    }

    function abrirFormProducto(p = null) {
        formProd.reset();
        $('#prod-error').hidden = true;
        formProd.elements.id.value = p ? p.id : 0;
        $('#dlg-prod-titulo').textContent = p ? 'Editar plato' : 'Nuevo plato';
        $('#btn-guardar-plato').textContent = p ? 'Guardar cambios' : 'Guardar plato';
        if (p) {
            formProd.elements.nombre.value = p.nombre;
            formProd.elements.descripcion.value = p.descripcion;
            formProd.elements.precio.value = p.precio;
            formProd.elements.categoria.value = p.categoria;
            formProd.elements.etiqueta.value = p.etiqueta || '';
            formProd.elements.estado_activo.checked = p.activo === 1;
        }
        vistaPrevia(p ? p.imagen : '');
        dlgProd.showModal();
        formProd.elements.nombre.focus();
    }

    $('#btn-nuevo-plato').addEventListener('click', () => abrirFormProducto());
    $$('[data-cerrar]', dlgProd).forEach(b => b.addEventListener('click', () => dlgProd.close()));

    $('#pr-imagen').addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) vistaPrevia(URL.createObjectURL(f));
    });

    formProd.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#prod-error');
        err.hidden = true;
        const f = formProd.elements;
        const fallo = m => { err.textContent = m; err.hidden = false; };

        if (f.nombre.value.trim().length < 2) return fallo('Escribe el nombre del plato.');
        if (!(parseFloat(f.precio.value) > 0)) return fallo('Escribe un precio mayor que cero.');
        if (f.imagen.files[0] && f.imagen.files[0].size > 3 * 1024 * 1024) return fallo('La foto pesa más de 3 MB. Elige una más liviana.');

        const btn = $('#btn-guardar-plato');
        btn.disabled = true;
        try {
            await api('producto_guardar', {}, new FormData(formProd));
            recargarConMensaje(Number(f.id.value) > 0 ? 'Cambios guardados.' : 'Plato agregado a la carta.');
        } catch (error) {
            fallo(error.message);
            btn.disabled = false;
        }
    });

    $('#prod-grid').addEventListener('click', async e => {
        const btn = e.target.closest('[data-accion]');
        if (!btn || btn.tagName === 'INPUT') return;
        const card = btn.closest('.prod');
        const datos = JSON.parse(card.dataset.producto);

        if (btn.dataset.accion === 'producto-editar') return abrirFormProducto(datos);

        if (btn.dataset.accion === 'producto-eliminar') {
            const si = await confirmar(`¿Eliminar “${datos.nombre}”?`, 'Se borra de la carta para siempre. Tu historial de ventas se conserva. Si solo quieres ocultarlo un tiempo, usa el interruptor.');
            if (!si) return;
            try {
                await api('producto_eliminar', { id: datos.id });
                recargarConMensaje('Plato eliminado.');
            } catch (err) { toast(err.message, 'error'); }
        }
    });

    $('#prod-grid').addEventListener('change', async e => {
        const chk = e.target.closest('input[data-accion="producto-toggle"]');
        if (!chk) return;
        const card = chk.closest('.prod');
        const id = Number(card.dataset.id);
        chk.disabled = true;
        try {
            const d = await api('producto_toggle', { id });
            const activo = d.activo === 1;
            chk.checked = activo;
            card.classList.toggle('is-off', !activo);
            $('[data-toggle-label]', card).textContent = activo ? 'Activo' : 'Oculto';
            const datos = JSON.parse(card.dataset.producto);
            datos.activo = d.activo;
            card.dataset.producto = JSON.stringify(datos);
            toast(activo ? 'El plato ya se ve en la carta.' : 'El plato quedó oculto para los clientes.');
        } catch (err) {
            chk.checked = !chk.checked;
            toast(err.message, 'error');
        } finally {
            chk.disabled = false;
        }
    });

    /* ---------------------------------------------------------
       7. RESERVAS
       --------------------------------------------------------- */
    let filtroReservas = 'proximas';

    function filtrarReservas() {
        const cuerpo = $('#tabla-reservas tbody');
        const filas = $$('tr', cuerpo);
        const asc = filtroReservas === 'proximas' || filtroReservas === 'pendientes';

        filas.sort((a, b) => {
            const ka = `${a.dataset.fecha} ${a.dataset.hora}`, kb = `${b.dataset.fecha} ${b.dataset.hora}`;
            return asc ? ka.localeCompare(kb) : kb.localeCompare(ka);
        }).forEach(tr => cuerpo.appendChild(tr));

        let visibles = 0;
        filas.forEach(tr => {
            const futura = tr.dataset.fecha >= HOY;
            const est = tr.dataset.estado;
            const ok = {
                proximas:   futura && est !== 'cancelada',
                pendientes: futura && est === 'pendiente',
                pasadas:    !futura,
                todas:      true,
            }[filtroReservas];
            tr.hidden = !ok;
            if (ok) visibles++;
        });
        $('#reservas-vacio').hidden = visibles > 0;
        $('#tabla-reservas').hidden = visibles === 0;
    }

    $('#reservas-chips').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        filtroReservas = chip.dataset.filtro;
        $$('#reservas-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
        filtrarReservas();
    });

    $('#tabla-reservas').addEventListener('change', async e => {
        const sel = e.target.closest('select[data-accion="reserva-estado"]');
        if (!sel) return;
        const tr = sel.closest('tr');
        const anterior = tr.dataset.estado;
        try {
            await api('reserva_estado', { id: Number(tr.dataset.id), estado: sel.value });
            tr.dataset.estado = sel.value;
            sel.className = `input select-estado est-${sel.value}`;
            const pend = $$('#tabla-reservas tbody tr').filter(r => r.dataset.estado === 'pendiente' && r.dataset.fecha >= HOY).length;
            reservasPrevias = pend;
            $('#badge-reservas').textContent = pend;
            $('#badge-reservas').hidden = pend === 0;
            toast({ confirmada: 'Reserva confirmada. Avísale al cliente por WhatsApp.', cancelada: 'Reserva cancelada.', pendiente: 'Reserva marcada por confirmar.' }[sel.value]);
        } catch (err) {
            sel.value = anterior;
            toast(err.message, 'error');
        }
    });

    /* ---------------------------------------------------------
       8. AJUSTES
       --------------------------------------------------------- */
    function pintarFilaHorario(fila) {
        fila.classList.toggle('is-off', !$('[data-h="activo"]', fila).checked);
    }
    $$('.hrow').forEach(fila => {
        pintarFilaHorario(fila);
        $('[data-h="activo"]', fila).addEventListener('change', () => pintarFilaHorario(fila));
    });

    $('#form-horarios').addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#horarios-error');
        err.hidden = true;
        const horarios = $$('.hrow').map(fila => ({
            dia: Number(fila.dataset.dia),
            activo: $('[data-h="activo"]', fila).checked,
            abre: $('[data-h="abre"]', fila).value,
            cierra: $('[data-h="cierra"]', fila).value,
        }));
        const btn = $('button[type="submit"]', e.target);
        btn.disabled = true;
        try {
            const d = await api('horarios_guardar', {
                horarios,
                mensaje_cierre: $('#a-mensaje').value,
                costo_delivery: $('#a-delivery').value || 0,
            });
            pintarLocal(d.estado);
            toast('Horario y ajustes guardados. La página del cliente ya los usa.');
        } catch (error) {
            err.textContent = error.message;
            err.hidden = false;
        } finally {
            btn.disabled = false;
        }
    });

    $('#form-password').addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#password-error');
        err.hidden = true;
        const btn = $('button[type="submit"]', e.target);
        btn.disabled = true;
        try {
            await api('password_cambiar', {
                actual: $('#p-actual').value,
                nueva: $('#p-nueva').value,
                repetir: $('#p-repetir').value,
            });
            e.target.reset();
            toast('Contraseña cambiada. Úsala la próxima vez que ingreses.');
            $$('.alert-warn').forEach(a => a.remove());
        } catch (error) {
            err.textContent = error.message;
            err.hidden = false;
        } finally {
            btn.disabled = false;
        }
    });

    /* ---------------------------------------------------------
       9. INICIO
       --------------------------------------------------------- */
    $$('.tab').forEach(t => t.addEventListener('click', () => irTab(t.dataset.tab)));
    $$('[data-ir-tab]').forEach(b => b.addEventListener('click', () => irTab(b.dataset.irTab)));

    document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarPedidos(); });

    pintarBotonSonido();
    $('#sound-note').hidden = !sonidoOn;       // se oculta apenas la persona toca la pantalla
    filtrarCarta();
    filtrarReservas();

    const hash = location.hash.replace('#', '');
    irTab(location.search.includes('desde') ? 'ventas' : (TABS.includes(hash) ? hash : 'pedidos'));
    window.scrollTo({ top: 0 });

    try {
        const flash = sessionStorage.getItem('mc_flash');
        if (flash) { sessionStorage.removeItem('mc_flash'); toast(flash); }
    } catch (e) { /* se ignora */ }

    programarPedidos();
})();
