<?php
require 'config.php';
require_once 'log_helper.php';

session_start();

if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Não autenticado']);
    exit;
}

$usuario_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];

$stmtAuth = $conn->prepare(
    "SELECT 1
     FROM usuario_clube
     WHERE usuario_id = ? AND clube_id = ? AND status = 'ativo'
     LIMIT 1"
);
$stmtAuth->bind_param('ii', $usuario_id, $clube_id);
$stmtAuth->execute();
$resultAuth = $stmtAuth->get_result();

if ($resultAuth->num_rows === 0) {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário sem vínculo ativo com este clube']);
    $stmtAuth->close();
    $conn->close();
    exit;
}

$stmtAuth->close();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $conn->prepare(
        'SELECT id, nome, tipo
         FROM categoria_movimentacao
         WHERE clube_id = ?
         ORDER BY tipo ASC, nome ASC'
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $categorias = [];
    while ($row = $result->fetch_assoc()) {
        $categorias[] = $row;
    }

    echo json_encode(['categorias' => $categorias]);
    $stmt->close();
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Método não permitido']);
    $conn->close();
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    $conn->close();
    exit;
}

$nome = trim($data['nome'] ?? '');
$tipo = trim($data['tipo'] ?? '');

if ($nome === '' || $tipo === '') {
    http_response_code(400);
    echo json_encode(['erro' => 'Preencha todos os campos obrigatórios']);
    $conn->close();
    exit;
}

if (!in_array($tipo, ['receita', 'despesa'], true)) {
    http_response_code(400);
    echo json_encode(['erro' => 'Tipo de categoria inválido']);
    $conn->close();
    exit;
}

$stmt = $conn->prepare(
    'INSERT INTO categoria_movimentacao (clube_id, nome, tipo)
     VALUES (?, ?, ?)'
);
$stmt->bind_param('iss', $clube_id, $nome, $tipo);

if (!$stmt->execute()) {
    if ((int) $conn->errno === 1062) {
        http_response_code(409);
        echo json_encode(['erro' => 'Já existe uma categoria com esse nome para este clube']);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao criar categoria', 'detalhe' => $stmt->error]);
    }
    $stmt->close();
    $conn->close();
    exit;
}

echo json_encode([
    'sucesso' => true,
    'categoria' => [
        'id' => $stmt->insert_id,
        'nome' => $nome,
        'tipo' => $tipo,
    ],
]);

$stmt->close();
$conn->close();
