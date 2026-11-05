<?php
/* =========================================================
   MAC CHICKEN — admin_dashboard.php
   Panel de administración. Secciones:
   Pedidos (en vivo) · Carta · Reservas · Ventas · Ajustes

   Lo que no cambia en vivo (carta, reservas, ventas, ajustes) se
   dibuja aquí con PHP. Los pedidos se actualizan solos cada pocos
   segundos con admin.js, que consulta admin_acciones.php.
   ========================================================= */
declare(strict_types=1);
require_once __DIR__ . '/funciones.php';

requerir_admin();
$csrf = csrf_token();

/* ---------- Utilidades de este archivo ---------- */
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fecha_corta(string $ymd): string
{
    $t = strtotime($ymd . ' 12:00:00');
    return DIAS_CORTO[(int) date('w', $t)] . ' ' . date('j', $t) . ' ' . MESES_CORTO[(int) date('n', $t) - 1];
}

function fecha_hora_corta(string $dt): string
{
    $t = strtotime($dt);
    return date('j', $t) . ' ' . MESES_CORTO[(int) date('n', $t) - 1] . ', ' . date('H:i', $t);
}

/* Número listo para wa.me (agrega 51 si son 9 dígitos de celular peruano) */
function wa_numero(string $tel): string
{
    $d = preg_replace('/\D+/', '', $tel) ?? '';
    return strlen($d) === 9 ? '51' . $d : $d;
}

function json_js($x): string
{
    return json_encode($x, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
}

$hoy = date('Y-m-d');

/* ---------- Estado del local y ajustes ---------- */
$estado = calcular_estado($pdo);
$cfg    = obtener_config($pdo);

$horariosFilas = $pdo->query(
    "SELECT dia_semana, TIME_FORMAT(abre, '%H:%i') AS abre, TIME_FORMAT(cierra, '%H:%i') AS cierra, activo
       FROM horarios"
)->fetchAll();
$horarios = [];
foreach ($horariosFilas as $f) {
    $horarios[(int) $f['dia_semana']] = $f;
}
$ordenDias = [1, 2, 3, 4, 5, 6, 0];   // lunes a domingo

/* ¿Sigue la contraseña inicial? (aviso para que la cambien) */
$st = $pdo->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
$st->execute([(int) $_SESSION['admin_id']]);
$passInicial = password_verify('MacChicken2026!', (string) $st->fetchColumn());

/* ---------- Carta ---------- */
$productos = $pdo->query('SELECT * FROM productos ORDER BY id')->fetchAll();

/* ---------- Reservas ---------- */
$reservas = $pdo->query('SELECT * FROM reservas ORDER BY fecha DESC, hora DESC LIMIT 300')->fetchAll();
$reservasPendientes = (int) $pdo->query("SELECT COUNT(*) FROM reservas WHERE estado = 'pendiente' AND fecha >= CURDATE()")->fetchColumn();

/* ---------- Ventas (rango de fechas) ---------- */
$validaFecha = static fn(string $s): bool => (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) && strtotime($s) !== false;
$desde = (string) ($_GET['desde'] ?? date('Y-m-01'));
$hasta = (string) ($_GET['hasta'] ?? $hoy);
if (!$validaFecha($desde)) $desde = date('Y-m-01');
if (!$validaFecha($hasta)) $hasta = $hoy;
if ($hasta < $desde) [$desde, $hasta] = [$hasta, $desde];
$hastaSig = (new DateTimeImmutable($hasta))->modify('+1 day')->format('Y-m-d');
$rango = [$desde, $hastaSig];

$q = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM pedidos
                     WHERE estado = 'entregado' AND fecha_creacion >= ? AND fecha_creacion < ?");
$q->execute($rango);
$resumen = $q->fetch();
$ventasTotal = (float) $resumen['t'];
$ventasN     = (int) $resumen['n'];
$ticket      = $ventasN > 0 ? $ventasTotal / $ventasN : 0.0;

$q = $pdo->prepare("SELECT metodo_pago, COUNT(*) AS n, SUM(total) AS t FROM pedidos
                     WHERE estado = 'entregado' AND fecha_creacion >= ? AND fecha_creacion < ?
                     GROUP BY metodo_pago");
$q->execute($rango);
$porPago = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0];
foreach ($q->fetchAll() as $r) $porPago[$r['metodo_pago']] = (float) $r['t'];

$q = $pdo->prepare("SELECT DATE(fecha_creacion) AS d, SUM(total) AS t FROM pedidos
                     WHERE estado = 'entregado' AND fecha_creacion >= ? AND fecha_creacion < ?
                     GROUP BY DATE(fecha_creacion) ORDER BY d");
$q->execute($rango);
$porDia = $q->fetchAll();
$maxDia = 0.0;
foreach ($porDia as $d) $maxDia = max($maxDia, (float) $d['t']);

$q = $pdo->prepare("SELECT dp.nombre_producto AS nombre, SUM(dp.cantidad) AS c, SUM(dp.subtotal) AS t
                      FROM detalle_pedidos dp JOIN pedidos p ON p.id = dp.pedido_id
                     WHERE p.estado = 'entregado' AND p.fecha_creacion >= ? AND p.fecha_creacion < ?
                     GROUP BY dp.nombre_producto ORDER BY c DESC, t DESC LIMIT 5");
$q->execute($rango);
$masVendidos = $q->fetchAll();

$q = $pdo->prepare("SELECT id, codigo, cliente, tipo, metodo_pago, total, estado, fecha_creacion FROM pedidos
                     WHERE fecha_creacion >= ? AND fecha_creacion < ?
                     ORDER BY fecha_creacion DESC, id DESC LIMIT 200");
$q->execute($rango);
$historial = $q->fetchAll();

$atajos = [
    'Hoy'         => [$hoy, $hoy],
    'Últimos 7 días' => [date('Y-m-d', strtotime('-6 days')), $hoy],
    'Este mes'    => [date('Y-m-01'), $hoy],
];

$tabInicial = isset($_GET['desde']) || isset($_GET['hasta']) ? 'ventas' : 'pedidos';
$nombreAdmin = (string) ($_SESSION['admin_nombre'] ?? 'Administrador');
$modoTxt = ['auto' => 'Automático, según el horario', 'abierto' => 'Manual: abierto', 'cerrado' => 'Manual: cerrado'][$estado['modo']];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#1a1a1a">
    <meta name="csrf-token" content="<?= h($csrf) ?>">
    <title>Panel | Mac Chicken</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="admin.css">
</head>
<body class="admin" data-tab-inicial="<?= h($tabInicial) ?>" data-hoy="<?= h($hoy) ?>">

<!-- =====================================================
     BARRA SUPERIOR: estado del local siempre a mano
     ===================================================== -->
<header class="topbar">
    <div class="topbar-inner">
        <span class="logo-box">MAC CHICKEN</span>

        <div class="local-control" id="local-control" data-modo="<?= h($estado['modo']) ?>">
            <label class="switch switch-lg" for="sw-local">
                <input type="checkbox" id="sw-local" role="switch" <?= $estado['abierto'] ? 'checked' : '' ?>>
                <span class="switch-ui" aria-hidden="true"></span>
                <span class="switch-text">
                    <strong id="local-label"><?= $estado['abierto'] ? 'Abierto' : 'Cerrado' ?></strong>
                    <small id="local-modo"><?= h($modoTxt) ?></small>
                </span>
            </label>
            <button type="button" class="btn-link" id="btn-auto" <?= $estado['modo'] === 'auto' ? 'hidden' : '' ?>>Volver al horario automático</button>
        </div>

        <div class="topbar-actions">
            <button type="button" class="icon-btn" id="btn-sonido" aria-pressed="true" aria-label="Sonido de nuevos pedidos: activado" title="Sonido de nuevos pedidos">
                <i class="fas fa-bell" aria-hidden="true"></i>
            </button>
            <a class="icon-btn" href="index.html" target="_blank" rel="noopener" aria-label="Ver la página del cliente" title="Ver la página del cliente">
                <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
            </a>
            <form action="logout.php" method="post" class="inline">
                <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
                <button type="submit" class="btn btn-ghost btn-sm"><i class="fas fa-right-from-bracket" aria-hidden="true"></i> <span class="hide-sm">Salir</span></button>
            </form>
        </div>
    </div>

    <nav class="tabs" role="tablist" aria-label="Secciones del panel">
        <button type="button" role="tab" class="tab" data-tab="pedidos" aria-selected="true">
            <i class="fas fa-fire-burner" aria-hidden="true"></i> Pedidos <span class="tab-badge" id="badge-pedidos" hidden>0</span>
        </button>
        <button type="button" role="tab" class="tab" data-tab="carta" aria-selected="false">
            <i class="fas fa-utensils" aria-hidden="true"></i> Carta
        </button>
        <button type="button" role="tab" class="tab" data-tab="reservas" aria-selected="false">
            <i class="fas fa-calendar-check" aria-hidden="true"></i> Reservas
            <span class="tab-badge" id="badge-reservas" <?= $reservasPendientes ? '' : 'hidden' ?>><?= $reservasPendientes ?></span>
        </button>
        <button type="button" role="tab" class="tab" data-tab="ventas" aria-selected="false">
            <i class="fas fa-chart-simple" aria-hidden="true"></i> Ventas
        </button>
        <button type="button" role="tab" class="tab" data-tab="ajustes" aria-selected="false">
            <i class="fas fa-sliders" aria-hidden="true"></i> Ajustes
        </button>
    </nav>
</header>

<main class="content">

<?php if ($passInicial): ?>
    <p class="alert alert-warn" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        Sigues usando la contraseña inicial. Cámbiala en <button type="button" class="btn-link" data-ir-tab="ajustes">Ajustes</button>.
    </p>
<?php endif; ?>

    <!-- =====================================================
         PEDIDOS EN VIVO
         ===================================================== -->
    <section class="panel" id="tab-pedidos" role="tabpanel" data-panel="pedidos">
        <div class="kpis">
            <div class="kpi"><span class="kpi-num" id="k-hoy">–</span><span class="kpi-lbl">Pedidos de hoy</span></div>
            <div class="kpi"><span class="kpi-num" id="k-ventas">–</span><span class="kpi-lbl">Vendido hoy (entregados)</span></div>
            <div class="kpi kpi-alert" id="k-pend-box"><span class="kpi-num" id="k-pend">–</span><span class="kpi-lbl">Sin atender</span></div>
            <div class="kpi"><span class="kpi-num" id="k-curso">–</span><span class="kpi-lbl">En cocina o en camino</span></div>
        </div>

        <button type="button" class="sound-note" id="sound-note" hidden>
            <i class="fas fa-volume-high" aria-hidden="true"></i>
            Toca aquí para activar el aviso sonoro de nuevos pedidos
        </button>

        <p class="conn-note" id="conn-note" role="status" hidden>
            <i class="fas fa-wifi" aria-hidden="true"></i> Sin conexión con el servidor. Reintentando…
        </p>

        <div class="board" id="board">
            <section class="col" data-col="pendiente" aria-labelledby="col-pendiente">
                <h2 id="col-pendiente" class="col-title">Pendientes <span class="count" data-count>0</span></h2>
                <div class="col-body" data-body></div>
            </section>
            <section class="col" data-col="en proceso" aria-labelledby="col-proceso">
                <h2 id="col-proceso" class="col-title">En preparación <span class="count" data-count>0</span></h2>
                <div class="col-body" data-body></div>
            </section>
            <section class="col" data-col="en camino" aria-labelledby="col-camino">
                <h2 id="col-camino" class="col-title">En camino o por recoger <span class="count" data-count>0</span></h2>
                <div class="col-body" data-body></div>
            </section>
            <section class="col" data-col="entregado" aria-labelledby="col-entregado">
                <h2 id="col-entregado" class="col-title">Entregados hoy <span class="count" data-count>0</span></h2>
                <div class="col-body" data-body></div>
            </section>
        </div>
    </section>

    <!-- =====================================================
         CARTA (CRUD)
         ===================================================== -->
    <section class="panel" id="tab-carta" role="tabpanel" data-panel="carta" hidden>
        <div class="panel-head">
            <div>
                <h2>La carta</h2>
                <p class="muted"><?= count($productos) ?> platos. Los desactivados no se ven en la página del cliente.</p>
            </div>
            <button type="button" class="btn btn-yellow" id="btn-nuevo-plato"><i class="fas fa-plus" aria-hidden="true"></i> Nuevo plato</button>
        </div>

        <div class="toolbar">
            <div class="chips" id="carta-chips" role="group" aria-label="Filtrar por categoría">
                <button type="button" class="chip" data-cat="all" aria-pressed="true">Todos</button>
                <?php foreach (CATEGORIAS_CARTA as $id => $nombre): ?>
                    <button type="button" class="chip" data-cat="<?= h($id) ?>" aria-pressed="false"><?= h($nombre) ?></button>
                <?php endforeach; ?>
            </div>
            <input class="input search" type="search" id="carta-buscar" placeholder="Buscar un plato" aria-label="Buscar un plato" autocomplete="off">
        </div>

        <div class="prod-grid" id="prod-grid">
        <?php foreach ($productos as $p): ?>
            <?php $datos = [
                'id' => (int) $p['id'], 'nombre' => $p['nombre'], 'descripcion' => $p['descripcion'],
                'precio' => number_format((float) $p['precio'], 2, '.', ''), 'categoria' => $p['categoria'],
                'etiqueta' => $p['etiqueta'] ?? '', 'imagen' => $p['imagen'], 'activo' => (int) $p['estado_activo'],
            ]; ?>
            <article class="prod <?= $p['estado_activo'] ? '' : 'is-off' ?>" data-id="<?= (int) $p['id'] ?>"
                     data-cat="<?= h($p['categoria']) ?>" data-nombre="<?= h(mb_strtolower($p['nombre'] . ' ' . $p['descripcion'], 'UTF-8')) ?>"
                     data-producto="<?= h(json_js($datos)) ?>">
                <div class="prod-img">
                    <?php if ($p['imagen'] !== ''): ?>
                        <img src="<?= h($p['imagen']) ?>" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'prod-noimg',textContent:'🍗'}))">
                    <?php else: ?>
                        <span class="prod-noimg">🍗</span>
                    <?php endif; ?>
                </div>
                <div class="prod-info">
                    <h3><?= h($p['nombre']) ?></h3>
                    <p class="prod-desc"><?= h($p['descripcion']) ?></p>
                    <p class="prod-meta">
                        <span class="price"><?= dinero($p['precio']) ?></span>
                        <span class="tag"><?= h(CATEGORIAS_CARTA[$p['categoria']] ?? $p['categoria']) ?></span>
                        <?php if (!empty($p['etiqueta'])): ?><span class="tag tag-yellow"><?= h($p['etiqueta']) ?></span><?php endif; ?>
                    </p>
                </div>
                <div class="prod-actions">
                    <label class="switch" title="Mostrar u ocultar en la carta">
                        <input type="checkbox" data-accion="producto-toggle" <?= $p['estado_activo'] ? 'checked' : '' ?> aria-label="Mostrar <?= h($p['nombre']) ?> en la carta">
                        <span class="switch-ui" aria-hidden="true"></span>
                        <span class="switch-text"><small data-toggle-label><?= $p['estado_activo'] ? 'Activo' : 'Oculto' ?></small></span>
                    </label>
                    <button type="button" class="btn btn-ghost btn-sm" data-accion="producto-editar"><i class="fas fa-pen" aria-hidden="true"></i> Editar</button>
                    <button type="button" class="btn btn-danger-ghost btn-sm" data-accion="producto-eliminar" aria-label="Eliminar <?= h($p['nombre']) ?>"><i class="fas fa-trash" aria-hidden="true"></i></button>
                </div>
            </article>
        <?php endforeach; ?>
        </div>
        <p class="empty" id="carta-vacio" <?= $productos ? 'hidden' : '' ?>>
            <?= $productos ? 'No hay platos que coincidan con tu búsqueda.' : 'Aún no hay platos. Agrega el primero con “Nuevo plato”.' ?>
        </p>
    </section>

    <!-- =====================================================
         RESERVAS
         ===================================================== -->
    <section class="panel" id="tab-reservas" role="tabpanel" data-panel="reservas" hidden>
        <div class="panel-head">
            <div>
                <h2>Reservas de mesa</h2>
                <p class="muted">Las que hacen los clientes desde la página. Confirma o cancela cada una.</p>
            </div>
            <button type="button" class="btn btn-ghost" onclick="location.reload()"><i class="fas fa-rotate" aria-hidden="true"></i> Actualizar lista</button>
        </div>

        <div class="toolbar">
            <div class="chips" id="reservas-chips" role="group" aria-label="Filtrar reservas">
                <button type="button" class="chip" data-filtro="proximas" aria-pressed="true">Próximas</button>
                <button type="button" class="chip" data-filtro="pendientes" aria-pressed="false">Por confirmar</button>
                <button type="button" class="chip" data-filtro="pasadas" aria-pressed="false">Pasadas</button>
                <button type="button" class="chip" data-filtro="todas" aria-pressed="false">Todas</button>
            </div>
        </div>

        <div class="table-wrap">
            <table class="tabla" id="tabla-reservas">
                <thead>
                    <tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Personas</th><th>Celular</th><th>Comentarios</th><th>Estado</th></tr>
                </thead>
                <tbody>
                <?php foreach ($reservas as $r): ?>
                    <tr data-fecha="<?= h($r['fecha']) ?>" data-hora="<?= h(substr($r['hora'], 0, 5)) ?>" data-estado="<?= h($r['estado']) ?>" data-id="<?= (int) $r['id'] ?>">
                        <td data-label="Fecha">
                            <strong><?= h(fecha_corta($r['fecha'])) ?></strong>
                            <?php if ($r['fecha'] === $hoy): ?><span class="tag tag-yellow">Hoy</span><?php endif; ?>
                        </td>
                        <td data-label="Hora"><?= h(a12h(substr($r['hora'], 0, 5))) ?></td>
                        <td data-label="Cliente"><?= h($r['nombre']) ?></td>
                        <td data-label="Personas"><?= (int) $r['personas'] ?></td>
                        <td data-label="Celular">
                            <a class="link-wa" href="https://wa.me/<?= h(wa_numero($r['telefono'])) ?>" target="_blank" rel="noopener">
                                <i class="fab fa-whatsapp" aria-hidden="true"></i> <?= h($r['telefono']) ?>
                            </a>
                        </td>
                        <td data-label="Comentarios"><?= $r['notas'] ? h($r['notas']) : '<span class="muted">Sin comentarios</span>' ?></td>
                        <td data-label="Estado">
                            <select class="input select-estado est-<?= h($r['estado']) ?>" data-accion="reserva-estado" aria-label="Estado de la reserva de <?= h($r['nombre']) ?>">
                                <?php foreach (['pendiente' => 'Por confirmar', 'confirmada' => 'Confirmada', 'cancelada' => 'Cancelada'] as $v => $t): ?>
                                    <option value="<?= $v ?>" <?= $r['estado'] === $v ? 'selected' : '' ?>><?= $t ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <p class="empty" id="reservas-vacio" hidden>No hay reservas en esta vista.</p>
    </section>

    <!-- =====================================================
         VENTAS
         ===================================================== -->
    <section class="panel" id="tab-ventas" role="tabpanel" data-panel="ventas" hidden>
        <div class="panel-head">
            <div>
                <h2>Historial de ventas</h2>
                <p class="muted">Del <?= h(fecha_corta($desde)) ?> al <?= h(fecha_corta($hasta)) ?>. Solo se suman los pedidos entregados.</p>
            </div>
        </div>

        <form class="rango" method="get" action="admin_dashboard.php">
            <div class="field">
                <label for="f-desde">Desde</label>
                <input class="input" type="date" id="f-desde" name="desde" value="<?= h($desde) ?>" max="<?= h($hoy) ?>">
            </div>
            <div class="field">
                <label for="f-hasta">Hasta</label>
                <input class="input" type="date" id="f-hasta" name="hasta" value="<?= h($hasta) ?>" max="<?= h($hoy) ?>">
            </div>
            <button type="submit" class="btn btn-dark">Ver ventas</button>
            <div class="atajos">
                <?php foreach ($atajos as $nombre => [$a, $b]): ?>
                    <a class="chip" href="admin_dashboard.php?desde=<?= h($a) ?>&amp;hasta=<?= h($b) ?>" <?= ($a === $desde && $b === $hasta) ? 'aria-current="true"' : '' ?>><?= h($nombre) ?></a>
                <?php endforeach; ?>
            </div>
        </form>

        <div class="kpis">
            <div class="kpi kpi-main"><span class="kpi-num"><?= h(dinero($ventasTotal)) ?></span><span class="kpi-lbl">Total vendido</span></div>
            <div class="kpi"><span class="kpi-num"><?= $ventasN ?></span><span class="kpi-lbl">Pedidos entregados</span></div>
            <div class="kpi"><span class="kpi-num"><?= h(dinero($ticket)) ?></span><span class="kpi-lbl">Consumo promedio</span></div>
        </div>

        <div class="ventas-grid">
            <div class="card">
                <h3>Ventas por día</h3>
                <?php if ($porDia): ?>
                    <div class="bars" role="img" aria-label="Gráfico de ventas por día">
                        <?php foreach ($porDia as $d): $pct = $maxDia > 0 ? max(4, round(((float) $d['t'] / $maxDia) * 100)) : 4; ?>
                            <div class="bar" title="<?= h(fecha_corta($d['d']) . ': ' . dinero($d['t'])) ?>">
                                <span class="bar-val"><?= h(number_format((float) $d['t'], 0)) ?></span>
                                <span class="bar-fill" style="height: <?= $pct ?>%"></span>
                                <span class="bar-lbl"><?= h(date('j', strtotime($d['d']))) ?></span>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php else: ?>
                    <p class="empty">No hay ventas entregadas en estas fechas.</p>
                <?php endif; ?>
            </div>

            <div class="card">
                <h3>Cómo pagaron</h3>
                <ul class="pagos">
                    <?php foreach ($porPago as $metodo => $monto): $pct = $ventasTotal > 0 ? round($monto / $ventasTotal * 100) : 0; ?>
                        <li>
                            <div class="pago-row"><span><?= h(ucfirst($metodo)) ?></span><strong><?= h(dinero($monto)) ?></strong></div>
                            <div class="meter" aria-hidden="true"><span style="width: <?= $pct ?>%"></span></div>
                        </li>
                    <?php endforeach; ?>
                </ul>

                <h3 class="mt">Lo más pedido</h3>
                <?php if ($masVendidos): ?>
                    <ol class="top">
                        <?php foreach ($masVendidos as $m): ?>
                            <li><span><?= h($m['nombre']) ?></span><strong><?= (int) $m['c'] ?> und.</strong></li>
                        <?php endforeach; ?>
                    </ol>
                <?php else: ?>
                    <p class="muted">Todavía no hay datos.</p>
                <?php endif; ?>
            </div>
        </div>

        <h3 class="sec-title">Pedidos del período</h3>
        <?php if ($historial): ?>
            <div class="table-wrap">
                <table class="tabla">
                    <thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Pago</th><th>Estado</th><th class="num">Total</th></tr></thead>
                    <tbody>
                    <?php foreach ($historial as $p): ?>
                        <tr>
                            <td data-label="Código"><strong><?= h($p['codigo'] ?: 'MC-' . $p['id']) ?></strong></td>
                            <td data-label="Fecha"><?= h(fecha_hora_corta($p['fecha_creacion'])) ?></td>
                            <td data-label="Cliente"><?= h($p['cliente']) ?></td>
                            <td data-label="Tipo"><?= $p['tipo'] === 'delivery' ? 'Delivery' : 'Recojo' ?></td>
                            <td data-label="Pago"><?= h(ucfirst($p['metodo_pago'])) ?></td>
                            <td data-label="Estado"><span class="pill pill-<?= h(str_replace(' ', '-', $p['estado'])) ?>"><?= h(ucfirst($p['estado'])) ?></span></td>
                            <td data-label="Total" class="num"><strong><?= h(dinero($p['total'])) ?></strong></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php if (count($historial) >= 200): ?>
                <p class="muted">Se muestran los 200 pedidos más recientes. Acorta el rango de fechas para ver el resto.</p>
            <?php endif; ?>
        <?php else: ?>
            <p class="empty">No hay pedidos en estas fechas.</p>
        <?php endif; ?>
    </section>

    <!-- =====================================================
         AJUSTES: horario, delivery y contraseña
         ===================================================== -->
    <section class="panel" id="tab-ajustes" role="tabpanel" data-panel="ajustes" hidden>
        <div class="panel-head">
            <div>
                <h2>Ajustes</h2>
                <p class="muted">El horario manda cuando el local está en modo automático. Con el interruptor de arriba puedes abrir o cerrar a mano en cualquier momento.</p>
            </div>
        </div>

        <div class="ajustes-grid">
            <form class="card" id="form-horarios" novalidate>
                <h3>Horario de atención</h3>
                <div class="horas">
                    <?php foreach ($ordenDias as $d):
                        $f = $horarios[$d] ?? ['abre' => '12:00', 'cierra' => '23:00', 'activo' => 0]; ?>
                        <div class="hrow" data-dia="<?= $d ?>">
                            <label class="switch switch-sm hdia">
                                <input type="checkbox" data-h="activo" <?= $f['activo'] ? 'checked' : '' ?> aria-label="Atendemos el <?= h(mb_strtolower(DIAS_ES[$d], 'UTF-8')) ?>">
                                <span class="switch-ui" aria-hidden="true"></span>
                                <span class="switch-text"><?= h(DIAS_ES[$d]) ?></span>
                            </label>
                            <div class="hinputs">
                                <input class="input" type="time" data-h="abre" value="<?= h($f['abre']) ?>" aria-label="Abre el <?= h(mb_strtolower(DIAS_ES[$d], 'UTF-8')) ?>">
                                <span aria-hidden="true">a</span>
                                <input class="input" type="time" data-h="cierra" value="<?= h($f['cierra']) ?>" aria-label="Cierra el <?= h(mb_strtolower(DIAS_ES[$d], 'UTF-8')) ?>">
                            </div>
                            <span class="muted hcerrado">Cerrado todo el día</span>
                        </div>
                    <?php endforeach; ?>
                </div>

                <div class="field">
                    <label for="a-mensaje">Mensaje cuando cierras a mano</label>
                    <input class="input" type="text" id="a-mensaje" maxlength="200" value="<?= h($cfg['mensaje_cierre']) ?>">
                    <span class="hint">Lo ve el cliente junto al aviso “Cerrado”.</span>
                </div>
                <div class="field field-short">
                    <label for="a-delivery">Costo de delivery (S/)</label>
                    <input class="input" type="number" id="a-delivery" min="0" max="100" step="0.5" value="<?= h(number_format((float) $cfg['costo_delivery'], 2, '.', '')) ?>">
                    <span class="hint">Con 0 el cliente no ve la línea de delivery.</span>
                </div>

                <p class="alert alert-error" id="horarios-error" role="alert" hidden></p>
                <button type="submit" class="btn btn-dark">Guardar horario y ajustes</button>
            </form>

            <form class="card" id="form-password" novalidate autocomplete="off">
                <h3>Cambiar contraseña</h3>
                <p class="muted">Usuario: <strong>admin</strong>. Usa al menos 8 caracteres.</p>
                <div class="field">
                    <label for="p-actual">Contraseña actual</label>
                    <input class="input" type="password" id="p-actual" autocomplete="current-password" required>
                </div>
                <div class="field">
                    <label for="p-nueva">Contraseña nueva</label>
                    <input class="input" type="password" id="p-nueva" autocomplete="new-password" minlength="8" required>
                </div>
                <div class="field">
                    <label for="p-repetir">Repite la contraseña nueva</label>
                    <input class="input" type="password" id="p-repetir" autocomplete="new-password" minlength="8" required>
                </div>
                <p class="alert alert-error" id="password-error" role="alert" hidden></p>
                <button type="submit" class="btn btn-dark">Cambiar contraseña</button>
            </form>
        </div>
    </section>
</main>

<!-- =====================================================
     DIÁLOGO: CREAR / EDITAR PLATO
     ===================================================== -->
<dialog class="modal" id="dlg-producto" aria-labelledby="dlg-prod-titulo">
    <form id="form-producto" enctype="multipart/form-data" novalidate>
        <div class="modal-head">
            <h2 id="dlg-prod-titulo">Nuevo plato</h2>
            <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        </div>

        <div class="modal-body">
            <input type="hidden" name="accion" value="producto_guardar">
            <input type="hidden" name="id" value="0">

            <div class="field">
                <label for="pr-nombre">Nombre</label>
                <input class="input" type="text" id="pr-nombre" name="nombre" maxlength="100" required>
            </div>
            <div class="field">
                <label for="pr-desc">Descripción corta</label>
                <input class="input" type="text" id="pr-desc" name="descripcion" maxlength="255" placeholder="Ej. Con papas, ensalada y cremas">
            </div>

            <div class="form-row">
                <div class="field">
                    <label for="pr-precio">Precio (S/)</label>
                    <input class="input" type="number" id="pr-precio" name="precio" min="0.1" max="9999" step="0.1" inputmode="decimal" required>
                </div>
                <div class="field">
                    <label for="pr-cat">Categoría</label>
                    <select class="input" id="pr-cat" name="categoria" required>
                        <?php foreach (CATEGORIAS_CARTA as $id => $nombre): ?>
                            <option value="<?= h($id) ?>"><?= h($nombre) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="field">
                <label for="pr-etiqueta">Etiqueta (opcional)</label>
                <input class="input" type="text" id="pr-etiqueta" name="etiqueta" maxlength="40" placeholder="Ej. El favorito, Combo">
            </div>

            <div class="field">
                <label for="pr-imagen">Foto del plato</label>
                <div class="img-field">
                    <div class="img-preview" id="pr-preview"><span>🍗</span></div>
                    <div>
                        <input class="input" type="file" id="pr-imagen" name="imagen" accept="image/jpeg,image/png,image/webp">
                        <span class="hint">JPG, PNG o WebP de hasta 3 MB. Si no eliges una, se mantiene la actual.</span>
                    </div>
                </div>
            </div>

            <label class="check">
                <input type="checkbox" name="estado_activo" value="1" checked>
                <span>Mostrar este plato en la carta</span>
            </label>

            <p class="alert alert-error" id="prod-error" role="alert" hidden></p>
        </div>

        <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btn-yellow" id="btn-guardar-plato">Guardar plato</button>
        </div>
    </form>
</dialog>

<!-- DIÁLOGO: confirmar acciones que no se pueden deshacer -->
<dialog class="modal modal-sm" id="dlg-confirmar" aria-labelledby="conf-titulo">
    <div class="modal-body">
        <h2 id="conf-titulo">¿Seguro?</h2>
        <p id="conf-texto" class="muted"></p>
    </div>
    <div class="modal-foot">
        <button type="button" class="btn btn-ghost" id="conf-no">Cancelar</button>
        <button type="button" class="btn btn-danger" id="conf-si">Eliminar</button>
    </div>
</dialog>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<!-- Ticket de impresión térmica (58/80mm). Oculto en pantalla; admin.js lo llena
     y admin.css lo muestra solo dentro del diálogo de impresión. Ver imprimirTicket(). -->
<div id="print-ticket" aria-hidden="true"></div>

<script>
    window.MC_ADMIN = <?= json_js([
        'csrf'   => $csrf,
        'estado' => ['abierto' => $estado['abierto'], 'modo' => $estado['modo']],
        'categorias' => CATEGORIAS_CARTA,
    ]) ?>;
</script>
<script src="admin.js"></script>
</body>
</html>
