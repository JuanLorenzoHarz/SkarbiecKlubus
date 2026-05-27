<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Não autenticado']);
    exit;
}

$usuario_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];

function body_json() {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function autorizar_clube($conn, $usuario_id, $clube_id) {
    $stmt = $conn->prepare("SELECT 1 FROM usuario_clube WHERE usuario_id = ? AND clube_id = ? AND status = 'ativo' LIMIT 1");
    $stmt->bind_param('ii', $usuario_id, $clube_id);
    $stmt->execute();
    $ok = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    if (!$ok) {
        http_response_code(403);
        echo json_encode(['erro' => 'Sem acesso ao clube atual']);
        exit;
    }
}

function clube_no_evento($conn, $evento_id, $clube_id) {
    $stmt = $conn->prepare('SELECT 1 FROM evento_clube WHERE evento_id = ? AND clube_id = ? LIMIT 1');
    $stmt->bind_param('ii', $evento_id, $clube_id);
    $stmt->execute();
    $ok = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    return $ok;
}

function buscar_evento($conn, $evento_id, $clube_id) {
    $stmt = $conn->prepare(
        'SELECT e.id, e.nome, e.data_evento, e.ativo, e.finalizado_em, e.criado_por_clube_id
         FROM evento e
         INNER JOIN evento_clube ec ON ec.evento_id = e.id
         WHERE e.id = ? AND ec.clube_id = ? LIMIT 1'
    );
    $stmt->bind_param('ii', $evento_id, $clube_id);
    $stmt->execute();
    $evento = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $evento;
}

autorizar_clube($conn, $usuario_id, $clube_id);
$method = $_SERVER['REQUEST_METHOD'];
$acao = $_GET['acao'] ?? '';

if ($method === 'GET') {
    if ($acao === 'buscar_clubes') {
        $termo = '%' . trim($_GET['q'] ?? '') . '%';
        $stmt = $conn->prepare('SELECT id, nome, codigo, cidade FROM clube WHERE id <> ? AND (nome LIKE ? OR codigo LIKE ?) ORDER BY nome LIMIT 10');
        $stmt->bind_param('iss', $clube_id, $termo, $termo);
        $stmt->execute();
        echo json_encode(['clubes' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
        exit;
    }

    if ($acao === 'detalhe') {
        $evento_id = (int) ($_GET['evento_id'] ?? 0);
        $evento = buscar_evento($conn, $evento_id, $clube_id);
        if (!$evento) { http_response_code(404); echo json_encode(['erro' => 'Evento não encontrado']); exit; }

        $stmt = $conn->prepare('SELECT c.id, c.nome, c.codigo, c.cidade FROM evento_clube ec INNER JOIN clube c ON c.id = ec.clube_id WHERE ec.evento_id = ? ORDER BY c.nome');
        $stmt->bind_param('i', $evento_id);
        $stmt->execute();
        $clubes = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $fixos = $conn->prepare("SELECT id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo, 'fixo' origem FROM produto WHERE clube_id = ? AND ativo = 1 ORDER BY nome");
        $fixos->bind_param('i', $clube_id);
        $fixos->execute();
        $produtos_fixos = $fixos->get_result()->fetch_all(MYSQLI_ASSOC);
        $fixos->close();

        $ep = $conn->prepare("SELECT id, nome, descricao, preco_original, preco_venda, quantidade_estoque, ativo, 'evento' origem FROM evento_produto WHERE evento_id = ? AND clube_id = ? ORDER BY nome");
        $ep->bind_param('ii', $evento_id, $clube_id);
        $ep->execute();
        $produtos_evento = $ep->get_result()->fetch_all(MYSQLI_ASSOC);
        $ep->close();

        echo json_encode(['evento' => $evento, 'clubes' => $clubes, 'produtos_fixos' => $produtos_fixos, 'produtos_evento' => $produtos_evento]);
        exit;
    }

    if ($acao === 'relatorio') {
        $evento_id = (int) ($_GET['evento_id'] ?? 0);
        $evento = buscar_evento($conn, $evento_id, $clube_id);
        if (!$evento) { http_response_code(404); echo json_encode(['erro' => 'Evento não encontrado']); exit; }

        $stmtMeu = $conn->prepare(
            "SELECT origem, produto_id, MAX(valor_unitario) valor_unitario, MAX(custo_unitario) custo_unitario,
                    SUM(CASE WHEN tipo='saida' THEN quantidade ELSE 0 END) vendidos,
                    SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE 0 END) comprados,
                    SUM(CASE WHEN tipo='saida' THEN quantidade * valor_unitario ELSE 0 END) receita,
                    SUM(CASE WHEN tipo='entrada' THEN quantidade * custo_unitario ELSE 0 END) custo_compra
             FROM evento_movimento_produto
             WHERE evento_id = ? AND clube_id = ?
             GROUP BY origem, produto_id
             ORDER BY origem, produto_id"
        );
        $stmtMeu->bind_param('ii', $evento_id, $clube_id);
        $stmtMeu->execute();
        $meus = $stmtMeu->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtMeu->close();

        foreach ($meus as &$m) {
            $tabela = $m['origem'] === 'fixo' ? 'produto' : 'evento_produto';
            $st = $conn->prepare("SELECT nome FROM $tabela WHERE id = ? LIMIT 1");
            $pid = (int) $m['produto_id'];
            $st->bind_param('i', $pid);
            $st->execute();
            $row = $st->get_result()->fetch_assoc();
            $m['nome'] = $row['nome'] ?? 'Produto removido';
            $m['lucro'] = (float)$m['receita'] - ((float)$m['vendidos'] * (float)$m['custo_unitario']);
            $st->close();
        }

        $stmtGeral = $conn->prepare(
            "SELECT c.id clube_id, c.nome clube_nome,
                    SUM(CASE WHEN emp.tipo='saida' THEN emp.quantidade * emp.valor_unitario ELSE 0 END) receita,
                    SUM(CASE WHEN emp.tipo='entrada' THEN emp.quantidade * emp.custo_unitario ELSE 0 END) compras,
                    SUM(CASE WHEN emp.tipo='saida' THEN emp.quantidade * emp.custo_unitario ELSE 0 END) custo_vendido
             FROM evento_clube ec
             INNER JOIN clube c ON c.id = ec.clube_id
             LEFT JOIN evento_movimento_produto emp ON emp.evento_id = ec.evento_id AND emp.clube_id = ec.clube_id
             WHERE ec.evento_id = ?
             GROUP BY c.id, c.nome
             ORDER BY c.nome"
        );
        $stmtGeral->bind_param('i', $evento_id);
        $stmtGeral->execute();
        $geral = $stmtGeral->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtGeral->close();
        foreach ($geral as &$g) { $g['lucro'] = (float)$g['receita'] - (float)$g['custo_vendido']; }

        $stmtAlertas = $conn->prepare(
            'SELECT ea.*, co.nome clube_origem, cd.nome clube_destino
             FROM evento_alerta ea
             INNER JOIN clube co ON co.id = ea.clube_origem_id
             INNER JOIN clube cd ON cd.id = ea.clube_destino_id
             WHERE ea.evento_id = ? AND (ea.clube_destino_id = ? OR ea.clube_origem_id = ?)
             ORDER BY ea.criado_em DESC'
        );
        $stmtAlertas->bind_param('iii', $evento_id, $clube_id, $clube_id);
        $stmtAlertas->execute();
        $alertas = $stmtAlertas->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtAlertas->close();

        echo json_encode(['evento' => $evento, 'meus_produtos' => $meus, 'relatorio_geral' => $geral, 'alertas' => $alertas]);
        exit;
    }

    $stmt = $conn->prepare(
        'SELECT e.id, e.nome, e.data_evento, e.ativo, e.finalizado_em,
                GROUP_CONCAT(c.nome ORDER BY c.nome SEPARATOR ", ") clubes
         FROM evento e
         INNER JOIN evento_clube ec ON ec.evento_id = e.id
         INNER JOIN clube c ON c.id = ec.clube_id
         WHERE e.id IN (SELECT evento_id FROM evento_clube WHERE clube_id = ?)
         GROUP BY e.id
         ORDER BY e.data_evento DESC, e.id DESC'
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    echo json_encode(['eventos' => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
    exit;
}

if ($method === 'POST') {
    $data = body_json();
    $acao = $data['acao'] ?? '';

    if ($acao === 'criar') {
        $nome = trim($data['nome'] ?? '');
        $data_evento = trim($data['data_evento'] ?? '');
        $clubes = $data['clubes_parceiros'] ?? [];
        if ($nome === '' || $data_evento === '') { http_response_code(400); echo json_encode(['erro' => 'Nome e data são obrigatórios']); exit; }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare('INSERT INTO evento (nome, data_evento, criado_por_clube_id) VALUES (?, ?, ?)');
            $stmt->bind_param('ssi', $nome, $data_evento, $clube_id);
            $stmt->execute();
            $evento_id = $stmt->insert_id;
            $stmt->close();

            $ins = $conn->prepare('INSERT IGNORE INTO evento_clube (evento_id, clube_id, papel) VALUES (?, ?, ?)');
            $papel = 'criador';
            $ins->bind_param('iis', $evento_id, $clube_id, $papel);
            $ins->execute();
            $papel = 'parceiro';
            foreach ($clubes as $cid) {
                $cid = (int) $cid;
                if ($cid > 0 && $cid !== $clube_id) { $ins->bind_param('iis', $evento_id, $cid, $papel); $ins->execute(); }
            }
            $ins->close();
            $conn->commit();
            echo json_encode(['sucesso' => true, 'evento_id' => $evento_id]);
        } catch (Throwable $e) { $conn->rollback(); http_response_code(500); echo json_encode(['erro' => 'Erro ao criar evento', 'detalhe' => $e->getMessage()]); }
        exit;
    }

    if ($acao === 'finalizar') {
        $evento_id = (int) ($data['evento_id'] ?? 0);
        if (!clube_no_evento($conn, $evento_id, $clube_id)) { http_response_code(403); echo json_encode(['erro' => 'Sem acesso ao evento']); exit; }
        $stmt = $conn->prepare('UPDATE evento SET ativo = 0, finalizado_em = NOW() WHERE id = ?');
        $stmt->bind_param('i', $evento_id);
        $stmt->execute();
        echo json_encode(['sucesso' => true]);
        exit;
    }

    if ($acao === 'criar_produto_evento') {
        $evento_id = (int) ($data['evento_id'] ?? 0);
        if (!clube_no_evento($conn, $evento_id, $clube_id)) { http_response_code(403); echo json_encode(['erro' => 'Sem acesso ao evento']); exit; }
        $nome = trim($data['nome'] ?? '');
        $descricao = trim($data['descricao'] ?? '');
        $preco_original = (float) ($data['preco_original'] ?? 0);
        $preco_venda = (float) ($data['preco_venda'] ?? 0);
        $qtd = (int) ($data['quantidade_estoque'] ?? 0);
        if ($nome === '' || $preco_original <= 0 || $preco_venda <= 0 || $qtd < 0) { http_response_code(400); echo json_encode(['erro' => 'Dados inválidos']); exit; }
        $custo = $preco_original * $qtd;
        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare('INSERT INTO evento_produto (evento_id, clube_id, nome, descricao, preco_original, preco_venda, quantidade_estoque) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $stmt->bind_param('iissddi', $evento_id, $clube_id, $nome, $descricao, $preco_original, $preco_venda, $qtd);
            $stmt->execute();
            $produto_id = $stmt->insert_id;
            $stmt->close();
            if ($custo > 0) {
                $tipo = 'entrada'; $origem = 'evento';
                $mov = $conn->prepare('INSERT INTO evento_movimento_produto (evento_id, clube_id, produto_id, origem, tipo, quantidade, valor_unitario, custo_unitario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
                $mov->bind_param('iiissidd', $evento_id, $clube_id, $produto_id, $origem, $tipo, $qtd, $preco_venda, $preco_original);
                $mov->execute(); $mov->close();
                $saldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?');
                $saldo->bind_param('di', $custo, $clube_id); $saldo->execute(); $saldo->close();
            }
            $conn->commit();
            echo json_encode(['sucesso' => true, 'produto_id' => $produto_id, 'custo_inicial' => $custo]);
        } catch (Throwable $e) { $conn->rollback(); http_response_code(500); echo json_encode(['erro' => 'Erro ao criar produto do evento', 'detalhe' => $e->getMessage()]); }
        exit;
    }

    if ($acao === 'movimentar_produto') {
        $evento_id = (int) ($data['evento_id'] ?? 0);
        $produto_id = (int) ($data['produto_id'] ?? 0);
        $origem = $data['origem'] ?? '';
        $tipo = $data['tipo'] ?? '';
        $qtd = max(1, (int) ($data['quantidade'] ?? 1));
        if (!clube_no_evento($conn, $evento_id, $clube_id) || !in_array($origem, ['fixo','evento'], true) || !in_array($tipo, ['entrada','saida'], true)) { http_response_code(400); echo json_encode(['erro' => 'Dados inválidos']); exit; }
        $tabela = $origem === 'fixo' ? 'produto' : 'evento_produto';
        $campoEvento = $origem === 'fixo' ? '' : ' AND evento_id = ?';
        $stmtP = $conn->prepare("SELECT id, preco_original, preco_venda, quantidade_estoque FROM $tabela WHERE id = ? AND clube_id = ? $campoEvento LIMIT 1");
        if ($origem === 'fixo') { $stmtP->bind_param('ii', $produto_id, $clube_id); } else { $stmtP->bind_param('iii', $produto_id, $clube_id, $evento_id); }
        $stmtP->execute(); $p = $stmtP->get_result()->fetch_assoc(); $stmtP->close();
        if (!$p) { http_response_code(404); echo json_encode(['erro' => 'Produto não encontrado']); exit; }
        $precoOriginal = (float)$p['preco_original']; $precoVenda = (float)$p['preco_venda'];
        $conn->begin_transaction();
        try {
            if ($tipo === 'saida') {
                $upd = $conn->prepare("UPDATE $tabela SET quantidade_estoque = quantidade_estoque - ? WHERE id = ? AND clube_id = ? AND quantidade_estoque >= ?");
                $upd->bind_param('iiii', $qtd, $produto_id, $clube_id, $qtd);
                $valorCaixa = $precoVenda * $qtd;
                $sqlSaldo = 'UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?';
            } else {
                $upd = $conn->prepare("UPDATE $tabela SET quantidade_estoque = quantidade_estoque + ? WHERE id = ? AND clube_id = ?");
                $upd->bind_param('iii', $qtd, $produto_id, $clube_id);
                $valorCaixa = $precoOriginal * $qtd;
                $sqlSaldo = 'UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?';
            }
            $upd->execute();
            if ($upd->affected_rows === 0) { throw new Exception('Estoque insuficiente ou produto inválido'); }
            $upd->close();
            $mov = $conn->prepare('INSERT INTO evento_movimento_produto (evento_id, clube_id, produto_id, origem, tipo, quantidade, valor_unitario, custo_unitario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            $mov->bind_param('iiissidd', $evento_id, $clube_id, $produto_id, $origem, $tipo, $qtd, $precoVenda, $precoOriginal);
            $mov->execute(); $mov->close();
            $saldo = $conn->prepare($sqlSaldo); $saldo->bind_param('di', $valorCaixa, $clube_id); $saldo->execute(); $saldo->close();
            $conn->commit();
            echo json_encode(['sucesso' => true, 'valor_movimento' => $valorCaixa]);
        } catch (Throwable $e) { $conn->rollback(); http_response_code(500); echo json_encode(['erro' => 'Erro ao movimentar produto', 'detalhe' => $e->getMessage()]); }
        exit;
    }

    if ($acao === 'enviar_repasse') {
        $evento_id = (int) ($data['evento_id'] ?? 0);
        $destino = (int) ($data['clube_destino_id'] ?? 0);
        $valor = (float) ($data['valor'] ?? 0);
        $porcentagem = isset($data['porcentagem']) && $data['porcentagem'] !== '' ? (float)$data['porcentagem'] : null;
        $mensagem = trim($data['mensagem'] ?? '');
        if (!clube_no_evento($conn, $evento_id, $clube_id) || !clube_no_evento($conn, $evento_id, $destino) || $valor <= 0 || $destino === $clube_id) { http_response_code(400); echo json_encode(['erro' => 'Repasse inválido']); exit; }
        $stmt = $conn->prepare('INSERT INTO evento_alerta (evento_id, clube_origem_id, clube_destino_id, valor, porcentagem, mensagem) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('iiidds', $evento_id, $clube_id, $destino, $valor, $porcentagem, $mensagem);
        $stmt->execute();
        echo json_encode(['sucesso' => true, 'alerta_id' => $stmt->insert_id]);
        exit;
    }

    if ($acao === 'verificar_alerta') {
    $alerta_id = (int) ($data['alerta_id'] ?? 0);

    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare(
            'SELECT id, clube_origem_id, clube_destino_id, valor, verificado
             FROM evento_alerta
             WHERE id = ? AND clube_destino_id = ?
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->bind_param('ii', $alerta_id, $clube_id);
        $stmt->execute();
        $alerta = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$alerta) {
            throw new Exception('Alerta não encontrado ou sem acesso.');
        }

        if ((int) $alerta['verificado'] === 1) {
            throw new Exception('Esse alerta já foi verificado.');
        }

        $origemId = (int) $alerta['clube_origem_id'];
        $destinoId = (int) $alerta['clube_destino_id'];
        $valor = (float) $alerta['valor'];

        if ($valor <= 0) {
            throw new Exception('Valor inválido para repasse.');
        }

        $stmtOrigem = $conn->prepare(
            'UPDATE clube SET saldo_atual = saldo_atual - ? WHERE id = ?'
        );
        $stmtOrigem->bind_param('di', $valor, $origemId);
        $stmtOrigem->execute();
        $stmtOrigem->close();

        $stmtDestino = $conn->prepare(
            'UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?'
        );
        $stmtDestino->bind_param('di', $valor, $destinoId);
        $stmtDestino->execute();
        $stmtDestino->close();

        $stmtVerifica = $conn->prepare(
            'UPDATE evento_alerta
             SET verificado = 1, verificado_em = NOW()
             WHERE id = ? AND clube_destino_id = ? AND verificado = 0'
        );
        $stmtVerifica->bind_param('ii', $alerta_id, $clube_id);
        $stmtVerifica->execute();

        if ($stmtVerifica->affected_rows === 0) {
            throw new Exception('Não foi possível verificar o alerta.');
        }

        $stmtVerifica->close();

        $conn->commit();

        echo json_encode([
            'sucesso' => true,
            'valor_movimentado' => $valor
        ]);
    } catch (Throwable $e) {
        $conn->rollback();

        http_response_code(400);
        echo json_encode([
            'erro' => $e->getMessage()
        ]);
    }

    exit;
}
}

http_response_code(405);
echo json_encode(['erro' => 'Método ou ação inválida']);
