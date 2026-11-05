<?php
/* =========================================================
   MAC CHICKEN — funciones.php
   Funciones compartidas por la web pública, la API y el panel.
   Requiere PHP 8.0 o superior (XAMPP actual lo trae).
   ========================================================= */
declare(strict_types=1);

require_once __DIR__ . '/conexion.php';

/* Categorías de la carta: id => nombre.
   Los ids deben ser los mismos que guarda la columna productos.categoria.
   Si agregas una categoría nueva, solo añádela aquí. */
const CATEGORIAS_CARTA = [
    'pollo'     => 'Pollo y platos',
    'bebidas'   => 'Bebidas',
    'calientes' => 'Calientes',
];

const ESTADOS_PEDIDO = ['pendiente', 'en proceso', 'en camino', 'entregado'];

/* Estado de la BD → id que entiende la línea de tiempo de script.js */
const ESTADO_PUBLICO = [
    'pendiente'  => 'recibido',
    'en proceso' => 'preparando',
    'en camino'  => 'en_camino',
    'entregado'  => 'entregado',
];

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/* ---------------------------------------------------------
   CORS para la API pública (api/*.php)
   Hoy el frontend (index.html) y la API viven en el mismo dominio de
   InfinityFree, así que estas cabeceras no son necesarias para que el
   pedido/carta funcionen (CONFIG.apiBase en script.js usa rutas relativas).
   Se dejan igual: son inofensivas en el mismo dominio y evitan tener que
   tocar nada si algún día vuelves a separar el frontend a otro dominio
   (por ejemplo GitHub Pages). Los archivos de /api la llaman primero que
   nada, antes de leer la BD.
   No se usa en el panel (admin_dashboard.php, admin_acciones.php): ese solo
   lo abre el navegador del dueño, en el mismo dominio, con cookies de sesión,
   y mezclar cookies con Access-Control-Allow-Origin: * sería inseguro.
   --------------------------------------------------------- */
function enviar_cors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');

    // El navegador manda un OPTIONS "de prueba" antes del POST con JSON.
    // Se responde vacío y se corta aquí: nunca debe llegar a tocar la BD.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */
function h($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function dinero($n): string
{
    return 'S/ ' . number_format((float) $n, 2, '.', ',');
}

function json_out($datos, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* Lee el cuerpo JSON de un POST (máx. 32 KB). Corta la petición si no es válido. */
function leer_json(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        json_out(['error' => 'Método no permitido.'], 405);
    }
    // Exigir application/json evita que otra web envíe formularios a tu API
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        json_out(['error' => 'Formato no válido.'], 415);
    }
    $crudo = file_get_contents('php://input', false, null, 0, 32768);
    $datos = json_decode((string) $crudo, true);
    if (!is_array($datos)) {
        json_out(['error' => 'Datos no válidos.'], 400);
    }
    return $datos;
}

/* "14:30" o "14:30:00" → "2:30 p. m."  (igual que a12h() de script.js) */
function a12h(string $hhmm): string
{
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return ($h % 12 ?: 12) . ':' . str_pad((string) $m, 2, '0', STR_PAD_LEFT) . ' ' . ($h >= 12 ? 'p. m.' : 'a. m.');
}

function a_minutos(string $hhmm): int
{
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return $h * 60 + $m;
}

/* ---------------------------------------------------------
   Configuración, horarios y estado del local
   --------------------------------------------------------- */
function obtener_config(PDO $pdo): array
{
    $porDefecto = [
        'modo_local'     => 'auto',
        'mensaje_cierre' => 'Cerrado por ahora.',
        'costo_delivery' => '0',
    ];
    $filas = $pdo->query('SELECT clave, valor FROM configuracion')->fetchAll(PDO::FETCH_KEY_PAIR);
    return array_merge($porDefecto, $filas);
}

function guardar_config(PDO $pdo, string $clave, string $valor): void
{
    $st = $pdo->prepare(
        'INSERT INTO configuracion (clave, valor) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)'
    );
    $st->execute([$clave, $valor]);
}

/* Devuelve [0..6] => ['abre' => 'HH:MM', 'cierra' => 'HH:MM'] o null si ese día no se atiende */
function obtener_horarios(PDO $pdo): array
{
    $horario = array_fill(0, 7, null);
    $filas = $pdo->query(
        "SELECT dia_semana, TIME_FORMAT(abre, '%H:%i') AS abre, TIME_FORMAT(cierra, '%H:%i') AS cierra, activo
           FROM horarios"
    )->fetchAll();
    foreach ($filas as $f) {
        $d = (int) $f['dia_semana'];
        if ($d >= 0 && $d <= 6) {
            $horario[$d] = $f['activo'] ? ['abre' => $f['abre'], 'cierra' => $f['cierra']] : null;
        }
    }
    return $horario;
}

/* Estado del local con la misma forma que espera script.js:
   { abierto, cierraPronto, detalle }  +  modo, horario y costoDelivery */
function calcular_estado(PDO $pdo): array
{
    $cfg     = obtener_config($pdo);
    $horario = obtener_horarios($pdo);
    $ahora   = new DateTimeImmutable('now', new DateTimeZone('America/Lima'));
    $dia     = (int) $ahora->format('w');
    $min     = (int) $ahora->format('G') * 60 + (int) $ahora->format('i');
    $modo    = in_array($cfg['modo_local'], ['auto', 'abierto', 'cerrado'], true) ? $cfg['modo_local'] : 'auto';

    $base = [
        'modo'          => $modo,
        'horario'       => $horario,
        'costoDelivery' => (float) $cfg['costo_delivery'],
    ];

    $hoy    = $horario[$dia];
    $dentro = $hoy !== null && $min >= a_minutos($hoy['abre']) && $min < a_minutos($hoy['cierra']);

    // 1) Cerrado a mano desde el panel
    if ($modo === 'cerrado') {
        return $base + [
            'abierto'      => false,
            'cierraPronto' => false,
            'detalle'      => $cfg['mensaje_cierre'] !== '' ? $cfg['mensaje_cierre'] : 'Cerrado por ahora.',
        ];
    }

    // 2) Abierto a mano, pero fuera del horario normal
    if ($modo === 'abierto' && !$dentro) {
        return $base + ['abierto' => true, 'cierraPronto' => false, 'detalle' => 'Estamos atendiendo ahora'];
    }

    // 3) Dentro del horario (modo automático o abierto)
    if ($dentro) {
        $restan = a_minutos($hoy['cierra']) - $min;
        $pronto = $restan <= 60;
        return $base + [
            'abierto'      => true,
            'cierraPronto' => $pronto,
            'detalle'      => $pronto
                ? 'Cerramos a las ' . a12h($hoy['cierra']) . " (en {$restan} min)"
                : 'Atendemos hasta las ' . a12h($hoy['cierra']),
        ];
    }

    // 4) Cerrado por horario: ¿cuándo abrimos?
    if ($hoy !== null && $min < a_minutos($hoy['abre'])) {
        return $base + ['abierto' => false, 'cierraPronto' => false, 'detalle' => 'Abrimos hoy a las ' . a12h($hoy['abre'])];
    }
    for ($i = 1; $i <= 7; $i++) {
        $d   = ($dia + $i) % 7;
        $sig = $horario[$d];
        if ($sig !== null) {
            $texto = $i === 1
                ? 'Abrimos mañana a las ' . a12h($sig['abre'])
                : 'Abrimos el ' . mb_strtolower(DIAS_ES[$d], 'UTF-8') . ' a las ' . a12h($sig['abre']);
            return $base + ['abierto' => false, 'cierraPronto' => false, 'detalle' => $texto];
        }
    }
    return $base + ['abierto' => false, 'cierraPronto' => false, 'detalle' => 'Por ahora no tenemos horario de atención.'];
}

/* ---------------------------------------------------------
   Carta pública: misma forma que PRODUCTOS_DEMO de script.js
   { id, name, price, cat, desc, img, tag, disponible }

   Solo se muestran los productos activos. Si prefieres que los
   desactivados aparezcan con la etiqueta "Agotado", quita el
   WHERE y pon 'disponible' => (bool) $p['estado_activo'].
   --------------------------------------------------------- */
function productos_publicos(PDO $pdo): array
{
    $filas = $pdo->query(
        'SELECT id, nombre, descripcion, precio, categoria, imagen, etiqueta
           FROM productos
          WHERE estado_activo = 1
          ORDER BY id'
    )->fetchAll();

    return array_map(static function (array $p): array {
        $o = [
            'id'         => (int) $p['id'],
            'name'       => $p['nombre'],
            'price'      => (float) $p['precio'],
            'cat'        => $p['categoria'],
            'desc'       => $p['descripcion'],
            'img'        => $p['imagen'] !== '' ? $p['imagen'] : 'img/sin-foto.jpg', // si no existe, script.js pone el 🍗
            'disponible' => true,
        ];
        if (!empty($p['etiqueta'])) {
            $o['tag'] = $p['etiqueta'];
        }
        return $o;
    }, $filas);
}

/* [{ id: 'all', nombre: 'Todos' }, { id: 'pollo', nombre: '…' }, …] para script.js */
function categorias_publicas(): array
{
    $lista = [['id' => 'all', 'nombre' => 'Todos']];
    foreach (CATEGORIAS_CARTA as $id => $nombre) {
        $lista[] = ['id' => $id, 'nombre' => $nombre];
    }
    return $lista;
}

/* ---------------------------------------------------------
   Sesión del administrador y protección CSRF
   --------------------------------------------------------- */
const SESION_MAX_INACTIVIDAD = 8 * 3600;   // 8 horas sin actividad cierran la sesión

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_name('MCADMIN');
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => !empty($_SERVER['HTTPS']),
        ]);
        session_start();
    }
}

function admin_logueado(): bool
{
    iniciar_sesion();
    if (empty($_SESSION['admin_id'])) {
        return false;
    }
    if (time() - (int) ($_SESSION['ultima_actividad'] ?? 0) > SESION_MAX_INACTIVIDAD) {
        $_SESSION = [];
        session_destroy();
        return false;
    }
    $_SESSION['ultima_actividad'] = time();
    return true;
}

/* Para páginas: si no hay sesión, manda al login */
function requerir_admin(): void
{
    if (!admin_logueado()) {
        header('Location: login.php');
        exit;
    }
}

function csrf_token(): string
{
    iniciar_sesion();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_valido(?string $token): bool
{
    iniciar_sesion();
    return !empty($_SESSION['csrf']) && is_string($token) && hash_equals($_SESSION['csrf'], $token);
}
