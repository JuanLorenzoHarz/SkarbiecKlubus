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

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

$tipo = trim($data['tipo'] ?? '');
$descricao = trim($data['descricao'] ?? '');
$valor = $data['valor'] ?? '';
$data_mov = $data['data'] ?? '';
$categoria_id = $data['categoria_id'] ?? '';
$evento_id = $data['evento_id'] ?? null;
$observacoes = trim($data['observacoes'] ?? '');

$usuario_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];

if ($tipo === '' || $descricao === '' || $valor === '' || $data_mov === '' || $categoria_id === '') {
    http_response_code(400);
    echo json_encode(['erro' => 'Preencha todos os campos obrigatórios']);
    exit;
}

if (!in_array($tipo, ['receita', 'despesa'], true)) {
    http_response_code(400);
    echo json_encode(['erro' => 'Tipo de movimentação inválido']);
    exit;
}

if (!is_numeric($valor)) {
    http_response_code(400);
    echo json_encode(['erro' => 'Valor inválido']);
    exit;
}

$valor = (float) $valor;
if ($valor <= 0) {
    http_response_code(400);
    echo json_encode(['erro' => 'O valor deve ser maior que zero']);
    exit;
}

$categoria_id = (int) $categoria_id;
$evento_id = $evento_id !== null && $evento_id !== '' ? (int) $evento_id : null;

$stmtCategoria = $conn->prepare(
    'SELECT id, tipo FROM categoria_movimentacao WHERE id = ? AND clube_id = ? LIMIT 1'
);
$stmtCategoria->bind_param('ii', $categoria_id, $clube_id);
$stmtCategoria->execute();
$categoria = $stmtCategoria->get_result()->fetch_assoc();
$stmtCategoria->close();

if (!$categoria) {
    http_response_code(400);
    echo json_encode(['erro' => 'Categoria inválida para o clube atual']);
    exit;
}

if ($categoria['tipo'] !== $tipo) {
    http_response_code(400);
    echo json_encode(['erro' => 'A categoria selecionada não corresponde ao tipo da movimentação']);
    exit;
}

$conn->begin_transaction();

try {
    $stmt = $conn->prepare(
        'INSERT INTO movimentacao (clube_id, evento_id, categoria_id, usuario_id, tipo, descricao, valor, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $stmt->bind_param(
        'iiiissds',
        $clube_id,
        $evento_id,
        $categoria_id,
        $usuario_id,
        $tipo,
        $descricao,
        $valor,
        $data_mov
    );

    if (!$stmt->execute()) {
        throw new Exception('Erro ao registrar movimentação: ' . $stmt->error);
    }

    if ($tipo === 'receita') {
        $stmtSaldo = $conn->prepare(
            'UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?'
        );
    } else {
        $stmtSaldo = $conn->prepare(
            'UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?'
        );
    }

    $stmtSaldo->bind_param('di', $valor, $clube_id);

    if (!$stmtSaldo->execute()) {
        throw new Exception('Erro ao atualizar saldo do clube: ' . $stmtSaldo->error);
    }

    $stmtConsultaSaldo = $conn->prepare('SELECT saldo_atual FROM clube WHERE id = ? LIMIT 1');
    $stmtConsultaSaldo->bind_param('i', $clube_id);
    $stmtConsultaSaldo->execute();
    $saldoAtual = $stmtConsultaSaldo->get_result()->fetch_assoc();

    $conn->commit();

    echo json_encode([
        'sucesso' => true,
        'saldo_atual' => $saldoAtual ? $saldoAtual['saldo_atual'] : null,
        'observacoes_recebidas' => $observacoes !== ''
    ]);

    $stmt->close();
    $stmtSaldo->close();
    $stmtConsultaSaldo->close();
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode([
        'erro' => 'Erro ao registrar movimentação',
        'detalhe' => $e->getMessage(),
    ]);
}

$conn->close();
