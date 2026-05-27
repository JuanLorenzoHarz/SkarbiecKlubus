<?php
require 'config.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

if (!isset($data['email'], $data['senha'], $data['clube'])) {
    http_response_code(400);
    echo json_encode(['erro' => 'Dados incompletos']);
    exit;
}

$email = trim($data['email']);
$senha = $data['senha'];
$codigo = strtoupper(trim($data['clube']));

$stmt = $conn->prepare(
    "SELECT u.id, u.senha_hash, c.id AS clube_id
     FROM usuario u
     JOIN usuario_clube uc ON uc.usuario_id = u.id
     JOIN clube c ON c.id = uc.clube_id
     WHERE u.email = ? AND c.codigo = ? AND uc.status = 'ativo'"
);
$stmt->bind_param('ss', $email, $codigo);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    http_response_code(404);
    echo json_encode(['erro' => 'Usuário não encontrado ou não aprovado']);
    exit;
}

$user = $result->fetch_assoc();

if (!password_verify($senha, $user['senha_hash'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Senha inválida']);
    exit;
}

session_start();
session_regenerate_id(true);

$_SESSION['user_id'] = $user['id'];
$_SESSION['clube_id'] = $user['clube_id'];

echo json_encode(['sucesso' => true]);
