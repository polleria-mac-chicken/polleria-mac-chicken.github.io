<?php
/* MAC CHICKEN — logout.php
   Cierra la sesión del administrador. Solo acepta POST con token CSRF
   (el botón "Salir" del panel es un pequeño formulario). */
declare(strict_types=1);
require_once __DIR__ . '/funciones.php';

iniciar_sesion();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_valido($_POST['csrf'] ?? null)) {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    header('Location: login.php');
    exit;
}

header('Location: admin_dashboard.php');
exit;
