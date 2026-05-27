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

$usuario_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];

$stmtAuth = $conn->prepare(
    "SELECT 1 FROM usuario_clube
     WHERE usuario_id = ? AND clube_id = ? AND status = 'ativo' LIMIT 1"
);
$stmtAuth->bind_param('ii', $usuario_id, $clube_id);
$stmtAuth->execute();
$resultAuth = $stmtAuth->get_result();

if ($resultAuth->num_rows === 0) {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário sem vínculo com o clube']);
    exit;
}

$stmtAuth->close();

function consultarSaldoAtual($conn, $clube_id) {
    $stmt = $conn->prepare('SELECT saldo_atual FROM clube WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $saldo = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $saldo ? (float) $saldo['saldo_atual'] : null;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $conn->prepare(
        "SELECT id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo
         FROM produto
         WHERE clube_id = ?
         ORDER BY nome ASC"
    );

    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $produtos = [];
    while ($row = $result->fetch_assoc()) {
        $produtos[] = $row;
    }

    echo json_encode(['produtos' => $produtos]);
    $stmt->close();
    $conn->close();
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['erro' => 'JSON inválido']);
        exit;
    }

    $acao = trim($data['acao'] ?? '');

    if ($acao === 'movimentar') {
        $id = (int) ($data['id'] ?? 0);
        $quantidade = (int) ($data['quantidade'] ?? 0);
        $tipo = trim($data['tipo'] ?? '');

        if ($id <= 0 || $quantidade <= 0 || !in_array($tipo, ['entrada', 'saida'], true)) {
            http_response_code(400);
            echo json_encode(['erro' => 'Dados inválidos para movimentação de estoque']);
            exit;
        }

        $stmtProduto = $conn->prepare(
            'SELECT id, nome, preco_original, preco_venda, quantidade_estoque
             FROM produto
             WHERE id = ? AND clube_id = ? LIMIT 1'
        );
        $stmtProduto->bind_param('ii', $id, $clube_id);
        $stmtProduto->execute();
        $produtoAtual = $stmtProduto->get_result()->fetch_assoc();
        $stmtProduto->close();

        if (!$produtoAtual) {
            http_response_code(400);
            echo json_encode(['erro' => 'Produto inválido']);
            exit;
        }

        if ($tipo === 'saida' && (int) $produtoAtual['quantidade_estoque'] < $quantidade) {
            http_response_code(400);
            echo json_encode(['erro' => 'Estoque insuficiente para realizar a venda']);
            exit;
        }

        $valorMovimento = $tipo === 'entrada'
            ? ((float) $produtoAtual['preco_original'] * $quantidade)
            : ((float) $produtoAtual['preco_venda'] * $quantidade);

        $conn->begin_transaction();

        try {
            if ($tipo === 'entrada') {
                $stmt = $conn->prepare(
                    'UPDATE produto
                     SET quantidade_estoque = quantidade_estoque + ?
                     WHERE id = ? AND clube_id = ?'
                );
                $stmt->bind_param('iii', $quantidade, $id, $clube_id);
            } else {
                $stmt = $conn->prepare(
                    'UPDATE produto
                     SET quantidade_estoque = quantidade_estoque - ?
                     WHERE id = ? AND clube_id = ? AND quantidade_estoque >= ?'
                );
                $stmt->bind_param('iiii', $quantidade, $id, $clube_id, $quantidade);
            }

            if (!$stmt->execute()) {
                throw new Exception('Erro ao movimentar estoque: ' . $stmt->error);
            }

            if ($stmt->affected_rows === 0) {
                throw new Exception($tipo === 'saida' ? 'Estoque insuficiente ou produto inválido' : 'Produto inválido');
            }
            $stmt->close();

            if ($tipo === 'entrada') {
                $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?');
            } else {
                $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?');
            }
            $stmtSaldo->bind_param('di', $valorMovimento, $clube_id);

            if (!$stmtSaldo->execute()) {
                throw new Exception('Erro ao atualizar o caixa do clube: ' . $stmtSaldo->error);
            }
            $stmtSaldo->close();

            $stmtConsulta = $conn->prepare(
                'SELECT id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo
                 FROM produto WHERE id = ? AND clube_id = ? LIMIT 1'
            );
            $stmtConsulta->bind_param('ii', $id, $clube_id);
            $stmtConsulta->execute();
            $produto = $stmtConsulta->get_result()->fetch_assoc();
            $stmtConsulta->close();

            $saldoAtual = consultarSaldoAtual($conn, $clube_id);
            $conn->commit();

            echo json_encode([
                'sucesso' => true,
                'produto' => $produto,
                'saldo_atual' => $saldoAtual,
                'valor_movimento' => $valorMovimento,
                'mensagem' => $tipo === 'entrada'
                    ? 'Estoque aumentado e caixa debitado com sucesso'
                    : 'Venda registrada e caixa creditado com sucesso'
            ]);
        } catch (Throwable $e) {
            $conn->rollback();
            http_response_code(500);
            echo json_encode(['erro' => 'Erro ao movimentar estoque', 'detalhe' => $e->getMessage()]);
        }

        $conn->close();
        exit;
    }

    if ($acao === 'editar') {
        $id = (int) ($data['id'] ?? 0);
        $nome = trim($data['nome'] ?? '');
        $descricao = $data['descricao'] ?? '';
        $preco_original = (float) ($data['preco_original'] ?? 0);
        $preco_venda = (float) ($data['preco_venda'] ?? 0);
        $quantidade = (int) ($data['quantidade_estoque'] ?? 0);
        $ativo = isset($data['ativo']) ? (int) $data['ativo'] : 1;

        if ($id <= 0 || $nome === '' || $preco_original <= 0 || $preco_venda <= 0 || $quantidade < 0) {
            http_response_code(400);
            echo json_encode(['erro' => 'Preencha os campos obrigatórios corretamente']);
            exit;
        }

        $stmtProduto = $conn->prepare(
            'SELECT id, quantidade_estoque FROM produto WHERE id = ? AND clube_id = ? LIMIT 1'
        );
        $stmtProduto->bind_param('ii', $id, $clube_id);
        $stmtProduto->execute();
        $produtoAtual = $stmtProduto->get_result()->fetch_assoc();
        $stmtProduto->close();

        if (!$produtoAtual) {
            http_response_code(404);
            echo json_encode(['erro' => 'Produto não encontrado']);
            exit;
        }

        $diferencaEstoque = $quantidade - (int) $produtoAtual['quantidade_estoque'];
        $ajusteCaixa = $diferencaEstoque === 0 ? 0 : ((float) $preco_original * abs($diferencaEstoque));

        $conn->begin_transaction();

        try {
            $stmt = $conn->prepare(
                'UPDATE produto
                 SET nome = ?, descricao = ?, preco_original = ?, preco_venda = ?, quantidade_estoque = ?, ativo = ?
                 WHERE id = ? AND clube_id = ?'
            );
            $stmt->bind_param(
                'ssddiiii',
                $nome,
                $descricao,
                $preco_original,
                $preco_venda,
                $quantidade,
                $ativo,
                $id,
                $clube_id
            );

            if (!$stmt->execute()) {
                throw new Exception('Erro ao editar produto: ' . $stmt->error);
            }
            $stmt->close();

            if ($diferencaEstoque !== 0) {
                if ($diferencaEstoque > 0) {
                    $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?');
                } else {
                    $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?');
                }
                $stmtSaldo->bind_param('di', $ajusteCaixa, $clube_id);

                if (!$stmtSaldo->execute()) {
                    throw new Exception('Erro ao atualizar o caixa do clube: ' . $stmtSaldo->error);
                }
                $stmtSaldo->close();
            }

            $stmtConsulta = $conn->prepare(
                'SELECT id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo
                 FROM produto WHERE id = ? AND clube_id = ? LIMIT 1'
            );
            $stmtConsulta->bind_param('ii', $id, $clube_id);
            $stmtConsulta->execute();
            $produto = $stmtConsulta->get_result()->fetch_assoc();
            $stmtConsulta->close();

            $saldoAtual = consultarSaldoAtual($conn, $clube_id);
            $conn->commit();

            echo json_encode([
                'sucesso' => true,
                'produto' => $produto,
                'saldo_atual' => $saldoAtual,
                'ajuste_caixa' => $diferencaEstoque === 0 ? 0 : ($diferencaEstoque > 0 ? -$ajusteCaixa : $ajusteCaixa),
                'mensagem' => 'Produto atualizado com sucesso'
            ]);
        } catch (Throwable $e) {
            $conn->rollback();
            http_response_code(500);
            echo json_encode(['erro' => 'Erro ao editar produto', 'detalhe' => $e->getMessage()]);
        }

        $conn->close();
        exit;
    }

    $nome = trim($data['nome'] ?? '');
    $descricao = $data['descricao'] ?? '';
    $preco_original = (float) ($data['preco_original'] ?? 0);
    $preco_venda = (float) ($data['preco_venda'] ?? 0);
    $quantidade = (int) ($data['quantidade_estoque'] ?? 0);
    $ativo = isset($data['ativo']) ? (int) $data['ativo'] : 1;

    if ($nome === '' || $preco_original <= 0 || $preco_venda <= 0 || $quantidade < 0) {
        http_response_code(400);
        echo json_encode(['erro' => 'Preencha os campos obrigatórios corretamente']);
        exit;
    }

    $custoInicial = $preco_original * $quantidade;
    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare(
            'INSERT INTO produto
             (clube_id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        $stmt->bind_param(
            'issddii',
            $clube_id,
            $nome,
            $descricao,
            $preco_original,
            $preco_venda,
            $quantidade,
            $ativo
        );

        if (!$stmt->execute()) {
            throw new Exception('Erro ao cadastrar produto: ' . $stmt->error);
        }

        $novoId = $stmt->insert_id;
        $stmt->close();

        if ($custoInicial > 0) {
            $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?');
            $stmtSaldo->bind_param('di', $custoInicial, $clube_id);

            if (!$stmtSaldo->execute()) {
                throw new Exception('Erro ao atualizar o caixa do clube: ' . $stmtSaldo->error);
            }
            $stmtSaldo->close();
        }

        $saldoAtual = consultarSaldoAtual($conn, $clube_id);
        $conn->commit();

        echo json_encode([
            'sucesso' => true,
            'produto' => [
                'id' => $novoId,
                'nome' => $nome,
                'descricao' => $descricao,
                'preco_original' => $preco_original,
                'preco_venda' => $preco_venda,
                'quantidade_estoque' => $quantidade,
                'ativo' => $ativo,
            ],
            'saldo_atual' => $saldoAtual,
            'custo_inicial' => $custoInicial,
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao cadastrar produto', 'detalhe' => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

http_response_code(405);
echo json_encode(['erro' => 'Método não permitido']);
$conn->close();
