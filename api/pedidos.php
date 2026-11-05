<?php
/* POST api/pedidos.php   (JSON)
   Recibe: { cliente, telefono, tipo, direccion, pago, notas, items:[{id, cant}] }
   Responde: { codigo, total }

   IMPORTANTE: el total NO se toma del navegador. Se recalcula aquí con
   los precios reales de la tabla `productos`. */
declare(strict_types=1);
require_once __DIR__ . '/../funciones.php';
enviar_cors();

$in = leer_json();

function rechazar(string $mensaje): void
{
    json_out(['error' => $mensaje], 422);
}

// ---- Datos del cliente ----
$cliente   = trim((string) ($in['cliente'] ?? ''));
$telefono  = trim((string) ($in['telefono'] ?? ''));
$tipo      = (string) ($in['tipo'] ?? 'delivery');
$direccion = trim((string) ($in['direccion'] ?? ''));
$pago      = strtolower(trim((string) ($in['pago'] ?? 'efectivo')));
$notas     = trim((string) ($in['notas'] ?? ''));

if (mb_strlen($cliente) < 2 || mb_strlen($cliente) > 100) rechazar('Escribe tu nombre.');
if (!in_array($tipo, ['delivery', 'recojo'], true))        rechazar('Tipo de pedido no válido.');
if (!in_array($pago, ['efectivo', 'yape', 'plin'], true))  rechazar('Forma de pago no válida.');
if ($telefono !== '' && !preg_match('/^[0-9+\s-]{7,15}$/', $telefono)) rechazar('El celular no es válido.');
if ($tipo === 'delivery') {
    if ($direccion === '' || mb_strlen($direccion) > 255) rechazar('Escribe tu dirección de entrega.');
} else {
    $direccion = '';
}
if (mb_strlen($notas) > 500) $notas = mb_substr($notas, 0, 500);

// ---- Platos: se juntan los repetidos y se validan cantidades ----
$pedidos = [];   // id => cantidad
foreach ((array) ($in['items'] ?? []) as $it) {
    $id   = (int) ($it['id'] ?? 0);
    $cant = (int) ($it['cant'] ?? 0);
    if ($id <= 0 || $cant < 1 || $cant > 99) rechazar('Hay un plato con datos no válidos.');
    $pedidos[$id] = min(99, ($pedidos[$id] ?? 0) + $cant);
}
if (!$pedidos || count($pedidos) > 40) rechazar('Agrega al menos un plato a tu pedido.');

// ---- Precios reales desde la base de datos ----
$ids = array_keys($pedidos);
$marcas = implode(',', array_fill(0, count($ids), '?'));
$st = $pdo->prepare("SELECT id, nombre, precio FROM productos WHERE estado_activo = 1 AND id IN ($marcas)");
$st->execute($ids);
$productos = [];
foreach ($st->fetchAll() as $p) {
    $productos[(int) $p['id']] = $p;
}
if (count($productos) !== count($ids)) {
    rechazar('Algún plato ya no está disponible. Revisa tu pedido.');
}

$subtotal = 0.0;
$lineas = [];
foreach ($pedidos as $id => $cant) {
    $precio = (float) $productos[$id]['precio'];
    $linea  = round($precio * $cant, 2);
    $subtotal += $linea;
    $lineas[] = [$id, $productos[$id]['nombre'], $cant, $precio, $linea];
}
$cfg   = obtener_config($pdo);
$envio = $tipo === 'delivery' ? max(0.0, (float) $cfg['costo_delivery']) : 0.0;
$total = round($subtotal + $envio, 2);

// ---- Guardar todo o nada ----
try {
    $pdo->beginTransaction();

    $st = $pdo->prepare(
        'INSERT INTO pedidos (cliente, telefono, direccion, tipo, metodo_pago, notas, subtotal, costo_envio, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $cliente,
        $telefono !== '' ? $telefono : null,
        $direccion !== '' ? $direccion : null,
        $tipo, $pago,
        $notas !== '' ? $notas : null,
        $subtotal, $envio, $total,
    ]);
    $pedidoId = (int) $pdo->lastInsertId();
    $codigo   = 'MC-' . $pedidoId;

    $pdo->prepare('UPDATE pedidos SET codigo = ? WHERE id = ?')->execute([$codigo, $pedidoId]);

    $ins = $pdo->prepare(
        'INSERT INTO detalle_pedidos (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    foreach ($lineas as [$pid, $nombre, $cant, $precio, $linea]) {
        $ins->execute([$pedidoId, $pid, $nombre, $cant, $precio, $linea]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[MacChicken] Error al guardar pedido: ' . $e->getMessage());
    json_out(['error' => 'No se pudo registrar el pedido.'], 500);
}

json_out(['codigo' => $codigo, 'total' => $total], 201);
