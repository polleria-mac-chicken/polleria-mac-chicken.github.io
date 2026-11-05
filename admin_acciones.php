<?php
/* =========================================================
   MAC CHICKEN — admin_acciones.php
   Todas las acciones AJAX del panel (siempre responde JSON).

   Seguridad:
   - Exige sesión de administrador (si no, 401).
   - Toda acción que modifica datos (POST) exige el token CSRF
     en la cabecera X-CSRF-Token.
   - Todas las consultas usan sentencias preparadas.
   ========================================================= */
declare(strict_types=1);
require_once __DIR__ . '/funciones.php';

if (!admin_logueado()) {
    json_out(['error' => 'Tu sesión expiró. Vuelve a iniciar sesión.', 'login' => true], 401);
}

/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */
function fallar(string $mensaje): void
{
    throw new RuntimeException($mensaje);
}

function numero_dinero($valor, float $max = 9999.99): float
{
    $v = str_replace(',', '.', trim((string) $valor));
    if (!is_numeric($v)) fallar('El precio no es válido.');
    $n = round((float) $v, 2);
    if ($n < 0 || $n > $max) fallar('El monto está fuera de rango.');
    return $n;
}

/* Añade los platos a cada pedido y calcula los minutos de espera.
   Incluye precio unitario y subtotal de cada plato (para el ticket de cocina
   que se imprime desde el panel: ver "Imprimir ticket" en admin.js). */
function pedidos_con_items(PDO $pdo, array $filas): array
{
    if (!$filas) return [];
    $ids   = array_map(static fn($f) => (int) $f['id'], $filas);
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare(
        "SELECT pedido_id, nombre_producto, cantidad, precio_unitario, subtotal
           FROM detalle_pedidos WHERE pedido_id IN ($marcas) ORDER BY id"
    );
    $st->execute($ids);
    $items = [];
    foreach ($st->fetchAll() as $r) {
        $items[(int) $r['pedido_id']][] = [
            'nombre'   => $r['nombre_producto'],
            'cant'     => (int) $r['cantidad'],
            'precio'   => (float) $r['precio_unitario'],
            'subtotal' => (float) $r['subtotal'],
        ];
    }
    $ahora = time();
    return array_map(static function (array $p) use ($items, $ahora): array {
        $creado = strtotime($p['fecha_creacion']);
        return [
            'id'        => (int) $p['id'],
            'codigo'    => $p['codigo'] ?: 'MC-' . $p['id'],
            'cliente'   => $p['cliente'],
            'telefono'  => $p['telefono'],
            'direccion' => $p['direccion'],
            'tipo'      => $p['tipo'],
            'pago'      => $p['metodo_pago'],
            'notas'     => $p['notas'],
            'subtotal'  => (float) $p['subtotal'],
            'envio'     => (float) $p['costo_envio'],
            'total'     => (float) $p['total'],
            'estado'    => $p['estado'],
            'eta'       => $p['eta_minutos'] !== null ? (int) $p['eta_minutos'] : null,
            'fecha'     => date('d/m/Y', $creado),
            'hora'      => date('H:i', $creado),
            'minutos'   => max(0, intdiv($ahora - $creado, 60)),
            'items'     => $items[(int) $p['id']] ?? [],
        ];
    }, $filas);
}

/* Borra un archivo subido por el panel (solo dentro de /uploads, nunca de /img) */
function borrar_imagen_subida(?string $ruta): void
{
    if ($ruta && preg_match('#^uploads/prod_[a-f0-9]{16}\.(jpg|png|webp)$#', $ruta)) {
        $archivo = __DIR__ . '/' . $ruta;
        if (is_file($archivo)) @unlink($archivo);
    }
}

/* Valida y guarda la foto de un plato. Devuelve la ruta relativa, o '' si no se envió archivo. */
function guardar_imagen(array $f): string
{
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return '';
    if ($f['error'] !== UPLOAD_ERR_OK) fallar('No se pudo subir la imagen. Prueba con otra.');
    if ($f['size'] > 3 * 1024 * 1024) fallar('La imagen pesa más de 3 MB.');

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $permitidos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($permitidos[$mime]) || @getimagesize($f['tmp_name']) === false) {
        fallar('Solo se aceptan imágenes JPG, PNG o WebP.');
    }

    $carpeta = __DIR__ . '/uploads';
    if (!is_dir($carpeta) && !mkdir($carpeta, 0755, true)) fallar('No se pudo crear la carpeta uploads/.');

    $nombre = 'prod_' . bin2hex(random_bytes(8)) . '.' . $permitidos[$mime];
    if (!move_uploaded_file($f['tmp_name'], $carpeta . '/' . $nombre)) fallar('No se pudo guardar la imagen.');
    return 'uploads/' . $nombre;
}

/* ---------------------------------------------------------
   GET: datos en vivo para el panel de pedidos
   --------------------------------------------------------- */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_GET['accion'] ?? '') !== 'pedidos') {
        json_out(['error' => 'Acción no válida.'], 400);
    }

    $activos = $pdo->query(
        "SELECT * FROM pedidos WHERE estado <> 'entregado' ORDER BY fecha_creacion ASC, id ASC"
    )->fetchAll();

    $entregados = $pdo->query(
        "SELECT * FROM pedidos WHERE estado = 'entregado' AND DATE(fecha_actualizacion) = CURDATE()
          ORDER BY fecha_actualizacion DESC LIMIT 30"
    )->fetchAll();

    $k = $pdo->query(
        "SELECT COUNT(*) AS pedidos_hoy,
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total END), 0) AS ventas_hoy
           FROM pedidos WHERE DATE(fecha_creacion) = CURDATE()"
    )->fetch();

    $maxId = (int) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM pedidos')->fetchColumn();
    $resPend = (int) $pdo->query("SELECT COUNT(*) FROM reservas WHERE estado = 'pendiente' AND fecha >= CURDATE()")->fetchColumn();

    json_out([
        'ok'                  => true,
        'max_id'              => $maxId,
        'activos'             => pedidos_con_items($pdo, $activos),
        'entregados'          => pedidos_con_items($pdo, $entregados),
        'pedidos_hoy'         => (int) $k['pedidos_hoy'],
        'ventas_hoy'          => (float) $k['ventas_hoy'],
        'reservas_pendientes' => $resPend,
    ]);
}

/* ---------------------------------------------------------
   POST: acciones que modifican datos
   --------------------------------------------------------- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['error' => 'Método no permitido.'], 405);
}
if (!csrf_valido($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
    json_out(['error' => 'La página caducó. Recárgala e inténtalo de nuevo.'], 403);
}

$esMultipart = stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') === 0;
$in = $esMultipart ? $_POST : (json_decode((string) file_get_contents('php://input', false, null, 0, 65536), true) ?: []);
$accion = (string) ($in['accion'] ?? '');

try {
    switch ($accion) {

        /* ===== PEDIDOS ===== */
        case 'pedido_estado': {
            $id = (int) ($in['id'] ?? 0);
            $estado = (string) ($in['estado'] ?? '');
            if ($id <= 0 || !in_array($estado, ESTADOS_PEDIDO, true)) fallar('Estado no válido.');
            $st = $pdo->prepare('UPDATE pedidos SET estado = ? WHERE id = ?');
            $st->execute([$estado, $id]);
            json_out(['ok' => true]);
        }

        case 'pedido_eta': {
            $id = (int) ($in['id'] ?? 0);
            $eta = $in['eta'] ?? null;
            $eta = ($eta === null || $eta === '') ? null : (int) $eta;
            if ($id <= 0 || ($eta !== null && ($eta < 1 || $eta > 240))) fallar('Tiempo no válido.');
            $pdo->prepare('UPDATE pedidos SET eta_minutos = ? WHERE id = ?')->execute([$eta, $id]);
            json_out(['ok' => true]);
        }

        /* ===== RESERVAS ===== */
        case 'reserva_estado': {
            $id = (int) ($in['id'] ?? 0);
            $estado = (string) ($in['estado'] ?? '');
            if ($id <= 0 || !in_array($estado, ['pendiente', 'confirmada', 'cancelada'], true)) fallar('Estado no válido.');
            $pdo->prepare('UPDATE reservas SET estado = ? WHERE id = ?')->execute([$estado, $id]);
            json_out(['ok' => true]);
        }

        /* ===== CARTA ===== */
        case 'producto_guardar': {
            $id          = (int) ($in['id'] ?? 0);
            $nombre      = trim((string) ($in['nombre'] ?? ''));
            $descripcion = trim((string) ($in['descripcion'] ?? ''));
            $categoria   = (string) ($in['categoria'] ?? '');
            $etiqueta    = trim((string) ($in['etiqueta'] ?? ''));
            $activo      = !empty($in['estado_activo']) ? 1 : 0;
            $precio      = numero_dinero($in['precio'] ?? '');

            if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 100) fallar('Escribe el nombre del plato (2 a 100 letras).');
            if (mb_strlen($descripcion) > 255)                      fallar('La descripción es muy larga (máx. 255).');
            if (mb_strlen($etiqueta) > 40)                          fallar('La etiqueta es muy larga (máx. 40).');
            if ($precio <= 0)                                       fallar('El precio debe ser mayor que cero.');
            if (!isset(CATEGORIAS_CARTA[$categoria]))               fallar('Elige una categoría.');

            $nueva = guardar_imagen($_FILES['imagen'] ?? []);

            if ($id > 0) {
                $st = $pdo->prepare('SELECT imagen FROM productos WHERE id = ?');
                $st->execute([$id]);
                $actual = $st->fetchColumn();
                if ($actual === false) { borrar_imagen_subida($nueva); fallar('Ese plato ya no existe.'); }

                $imagen = $nueva !== '' ? $nueva : (string) $actual;
                $pdo->prepare(
                    'UPDATE productos SET nombre=?, descripcion=?, precio=?, categoria=?, imagen=?, etiqueta=?, estado_activo=? WHERE id=?'
                )->execute([$nombre, $descripcion, $precio, $categoria, $imagen, $etiqueta !== '' ? $etiqueta : null, $activo, $id]);

                if ($nueva !== '') borrar_imagen_subida((string) $actual);   // quita la foto anterior si era subida desde el panel
            } else {
                $pdo->prepare(
                    'INSERT INTO productos (nombre, descripcion, precio, categoria, imagen, etiqueta, estado_activo) VALUES (?,?,?,?,?,?,?)'
                )->execute([$nombre, $descripcion, $precio, $categoria, $nueva, $etiqueta !== '' ? $etiqueta : null, $activo]);
            }
            json_out(['ok' => true]);
        }

        case 'producto_toggle': {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) fallar('Plato no válido.');
            $pdo->prepare('UPDATE productos SET estado_activo = 1 - estado_activo WHERE id = ?')->execute([$id]);
            $st = $pdo->prepare('SELECT estado_activo FROM productos WHERE id = ?');
            $st->execute([$id]);
            $nuevo = $st->fetchColumn();
            if ($nuevo === false) fallar('Ese plato ya no existe.');
            json_out(['ok' => true, 'activo' => (int) $nuevo]);
        }

        case 'producto_eliminar': {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) fallar('Plato no válido.');
            $st = $pdo->prepare('SELECT imagen FROM productos WHERE id = ?');
            $st->execute([$id]);
            $imagen = $st->fetchColumn();
            // El historial de ventas conserva el nombre y precio del plato (detalle_pedidos.producto_id pasa a NULL)
            $pdo->prepare('DELETE FROM productos WHERE id = ?')->execute([$id]);
            borrar_imagen_subida($imagen ?: null);
            json_out(['ok' => true]);
        }

        /* ===== LOCAL: abierto / cerrado / automático ===== */
        case 'local_modo': {
            $modo = (string) ($in['modo'] ?? '');
            if (!in_array($modo, ['auto', 'abierto', 'cerrado'], true)) fallar('Modo no válido.');
            guardar_config($pdo, 'modo_local', $modo);
            json_out(['ok' => true, 'estado' => calcular_estado($pdo)]);
        }

        /* ===== HORARIOS Y AJUSTES ===== */
        case 'horarios_guardar': {
            $filas = $in['horarios'] ?? [];
            if (!is_array($filas) || count($filas) !== 7) fallar('Faltan días en el horario.');

            $hora = '/^([01]\d|2[0-3]):[0-5]\d$/';
            $datos = [];
            foreach ($filas as $f) {
                $dia = (int) ($f['dia'] ?? -1);
                $activo = !empty($f['activo']) ? 1 : 0;
                $abre = (string) ($f['abre'] ?? '');
                $cierra = (string) ($f['cierra'] ?? '');
                if ($dia < 0 || $dia > 6) fallar('Día no válido.');
                if (!preg_match($hora, $abre) || !preg_match($hora, $cierra)) fallar('Revisa las horas de ' . DIAS_ES[$dia] . '.');
                if ($activo && a_minutos($cierra) <= a_minutos($abre)) fallar(DIAS_ES[$dia] . ': la hora de cierre debe ser después de la de apertura.');
                $datos[$dia] = [$abre . ':00', $cierra . ':00', $activo];
            }
            if (count($datos) !== 7) fallar('Faltan días en el horario.');

            $mensaje = trim((string) ($in['mensaje_cierre'] ?? ''));
            if (mb_strlen($mensaje) > 200) fallar('El mensaje de cierre es muy largo (máx. 200).');
            $delivery = numero_dinero($in['costo_delivery'] ?? 0, 100);

            $pdo->beginTransaction();
            $up = $pdo->prepare(
                'INSERT INTO horarios (dia_semana, abre, cierra, activo) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE abre = VALUES(abre), cierra = VALUES(cierra), activo = VALUES(activo)'
            );
            foreach ($datos as $dia => [$abre, $cierra, $activo]) {
                $up->execute([$dia, $abre, $cierra, $activo]);
            }
            guardar_config($pdo, 'mensaje_cierre', $mensaje);
            guardar_config($pdo, 'costo_delivery', number_format($delivery, 2, '.', ''));
            $pdo->commit();

            json_out(['ok' => true, 'estado' => calcular_estado($pdo)]);
        }

        /* ===== CONTRASEÑA ===== */
        case 'password_cambiar': {
            $actual = (string) ($in['actual'] ?? '');
            $nueva  = (string) ($in['nueva'] ?? '');
            $repite = (string) ($in['repetir'] ?? '');

            $st = $pdo->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
            $st->execute([(int) $_SESSION['admin_id']]);
            $hash = $st->fetchColumn();

            if (!$hash || !password_verify($actual, (string) $hash)) { usleep(400000); fallar('La contraseña actual no es correcta.'); }
            if (mb_strlen($nueva) < 8)   fallar('La nueva contraseña debe tener al menos 8 caracteres.');
            if ($nueva !== $repite)      fallar('Las contraseñas nuevas no coinciden.');
            if ($nueva === $actual)      fallar('La nueva contraseña debe ser distinta de la actual.');

            $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($nueva, PASSWORD_DEFAULT), (int) $_SESSION['admin_id']]);
            session_regenerate_id(true);
            json_out(['ok' => true]);
        }

        default:
            json_out(['error' => 'Acción no válida.'], 400);
    }
} catch (RuntimeException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[MacChicken] admin_acciones: ' . $e->getMessage());
    json_out(['error' => 'Ocurrió un error en el servidor. Inténtalo de nuevo.'], 500);
}
