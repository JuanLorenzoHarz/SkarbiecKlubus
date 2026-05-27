<?php
require_once __DIR__ . '/cors.php';

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL);

if (!function_exists('json_error_response')) {
    function json_error_response(int $status, string $message, ?string $detail = null): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }

        $payload = ['erro' => $message];
        if ($detail !== null && $detail !== '') {
            $payload['detalhe'] = $detail;
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }

    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function ($exception) {
    $status = $exception instanceof mysqli_sql_exception ? 500 : 500;
    json_error_response($status, 'Erro interno do servidor', $exception->getMessage());
});

register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        json_error_response(500, 'Erro interno do servidor', $error['message']);
    }
});

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$host = 'localhost';
$user = 'root';
$pass = '';
$db = 'SkarbiecKlubu';
$port = 3306;

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$conn = new mysqli($host, $user, $pass, $db, $port);

if ($conn->connect_error) {
    json_error_response(500, 'Erro na conexão com o banco de dados');
}

$conn->set_charset('utf8mb4');
