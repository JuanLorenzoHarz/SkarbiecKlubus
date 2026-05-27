<?php
require 'config.php';
require_once 'log_helper.php';

session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Não autenticado']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Método não permitido']);
    exit;
}

$usuario_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];
$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

$endpoint = trim($data['endpoint'] ?? '');
$payload = $data['payload'] ?? [];
$resultado = $data['resultado'] ?? [];

$mapa = [
    'movimentacao.php' => ['criar', 'movimentacao', 'Movimentação registrada'],
    'produtos.php' => ['movimentar', 'produto', 'Ação realizada em produtos'],
    'categoria.php' => ['criar', 'categoria', 'Categoria criada'],
    'cargo.php' => ['criar', 'cargo', 'Cargo criado'],
    'membro_clube.php' => ['vincular', 'usuario_clube', 'Usuário vinculado ao clube'],
    'mensalidades.php' => ['editar', 'mensalidade', 'Ação realizada em mensalidades'],
];

$config = $mapa[$endpoint] ?? ['executar', 'sistema', 'Ação realizada no sistema'];
$acao = $config[0];
$entidade = $config[1];
$descricao = $config[2];
$entidade_id = null;

if ($endpoint === 'produtos.php' && isset($payload['acao'])) {
    if ($payload['acao'] === 'editar') {
        $acao = 'editar';
        $descricao = 'Produto editado';
    } elseif ($payload['acao'] === 'movimentar') {
        $acao = 'movimentar';
        $descricao = ($payload['tipo'] ?? '') === 'saida' ? 'Venda de produto registrada' : 'Entrada de estoque registrada';
    } else {
        $acao = 'criar';
        $descricao = 'Produto cadastrado';
    }
}

if ($endpoint === 'mensalidades.php' && isset($payload['acao'])) {
    $acao = $payload['acao'] === 'atualizar_status' ? 'pagar' : 'editar';
    $descricao = 'Ação em mensalidades: ' . $payload['acao'];
}

if (isset($payload['id'])) {
    $entidade_id = (int) $payload['id'];
} elseif (isset($resultado['produto']['id'])) {
    $entidade_id = (int) $resultado['produto']['id'];
} elseif (isset($resultado['categoria']['id'])) {
    $entidade_id = (int) $resultado['categoria']['id'];
} elseif (isset($resultado['cargo']['id'])) {
    $entidade_id = (int) $resultado['cargo']['id'];
}

registrarHistorico($conn, $clube_id, $usuario_id, $acao, $entidade, $entidade_id, $descricao, [
    'endpoint' => $endpoint,
    'payload' => $payload,
    'resultado' => $resultado,
]);

$conn->close();
echo json_encode(['sucesso' => true]);
