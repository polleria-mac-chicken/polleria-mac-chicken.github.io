<?php
/* =========================================================
   MAC CHICKEN — login.php
   Inicio de sesión del administrador.
   - Contraseñas verificadas con password_verify()
   - Token CSRF en el formulario
   - Bloqueo de 60 s tras 5 intentos fallidos
   - session_regenerate_id() al entrar (evita fijación de sesión)
   ========================================================= */
declare(strict_types=1);
require_once __DIR__ . '/funciones.php';

iniciar_sesion();
if (admin_logueado()) {
    header('Location: admin_dashboard.php');
    exit;
}

$error = '';
$usuarioIngresado = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $usuarioIngresado = trim((string) ($_POST['usuario'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $bloqueadoHasta = (int) ($_SESSION['login_bloqueo'] ?? 0);

    if (!csrf_valido($_POST['csrf'] ?? null)) {
        $error = 'La página caducó. Inténtalo otra vez.';
    } elseif ($bloqueadoHasta > time()) {
        $error = 'Demasiados intentos. Espera ' . ($bloqueadoHasta - time()) . ' segundos.';
    } else {
        $st = $pdo->prepare('SELECT id, nombre, password_hash FROM usuarios WHERE usuario = ? AND activo = 1');
        $st->execute([$usuarioIngresado]);
        $u = $st->fetch();

        if ($u && password_verify($password, $u['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['admin_id']         = (int) $u['id'];
            $_SESSION['admin_nombre']     = $u['nombre'];
            $_SESSION['ultima_actividad'] = time();
            unset($_SESSION['login_intentos'], $_SESSION['login_bloqueo']);

            $pdo->prepare('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?')->execute([$u['id']]);
            if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
                $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
                    ->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
            }
            header('Location: admin_dashboard.php');
            exit;
        }

        usleep(500000);   // frena los intentos automáticos
        $_SESSION['login_intentos'] = (int) ($_SESSION['login_intentos'] ?? 0) + 1;
        if ($_SESSION['login_intentos'] >= 5) {
            $_SESSION['login_bloqueo'] = time() + 60;
            $_SESSION['login_intentos'] = 0;
        }
        $error = 'Usuario o contraseña incorrectos.';
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#1a1a1a">
    <title>Ingresar | Panel Mac Chicken</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="admin.css">
</head>
<body class="login-page">
    <main class="login-card">
        <span class="logo-box">MAC CHICKEN</span>
        <h1>Panel de administración</h1>
        <p class="login-sub">Ingresa con tu usuario para ver los pedidos y manejar la carta.</p>

        <?php if ($error !== ''): ?>
            <p class="alert alert-error" role="alert"><?= h($error) ?></p>
        <?php endif; ?>

        <form method="post" autocomplete="on" novalidate>
            <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">

            <div class="field">
                <label for="usuario">Usuario</label>
                <input class="input" type="text" id="usuario" name="usuario" value="<?= h($usuarioIngresado) ?>"
                       autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus>
            </div>

            <div class="field">
                <label for="password">Contraseña</label>
                <div class="input-group">
                    <input class="input" type="password" id="password" name="password" autocomplete="current-password" required>
                    <button type="button" class="input-addon" id="ver-pass" aria-label="Mostrar contraseña" aria-pressed="false">Mostrar</button>
                </div>
            </div>

            <button type="submit" class="btn btn-yellow btn-block">Entrar al panel</button>
        </form>

        <a class="login-back" href="index.html">Volver a la página de Mac Chicken</a>
    </main>

    <script>
        // Mostrar / ocultar contraseña
        const btn = document.getElementById('ver-pass');
        const campo = document.getElementById('password');
        btn.addEventListener('click', () => {
            const visible = campo.type === 'text';
            campo.type = visible ? 'password' : 'text';
            btn.textContent = visible ? 'Mostrar' : 'Ocultar';
            btn.setAttribute('aria-pressed', String(!visible));
            btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
        });
    </script>
</body>
</html>
