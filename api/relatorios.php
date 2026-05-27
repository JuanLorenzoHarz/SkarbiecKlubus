<?php
require 'config.php';

session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Não autenticado'], JSON_UNESCAPED_UNICODE);
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
$auth = $stmtAuth->get_result()->fetch_assoc();
$stmtAuth->close();

if (!$auth) {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário sem vínculo com o clube'], JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizar_data($valor) {
    $valor = trim((string) $valor);
    if ($valor === '') return null;
    $dt = DateTime::createFromFormat('Y-m-d', $valor);
    return $dt && $dt->format('Y-m-d') === $valor ? $valor : null;
}

function dinheiro($valor) {
    return round((float) $valor, 2);
}

function add_produto(&$mapa, $produtoId, $nome, $origem, $entrada, $saida, $quantidadeEntrada = 0, $quantidadeSaida = 0) {
    $chave = $origem . '-' . $produtoId;
    if (!isset($mapa[$chave])) {
        $mapa[$chave] = [
            'produto_id' => (int) $produtoId,
            'nome' => $nome ?: 'Produto removido',
            'origem' => $origem,
            'entradas' => 0.0,
            'saidas' => 0.0,
            'lucro' => 0.0,
            'qtd_entrada' => 0,
            'qtd_saida' => 0,
        ];
    }
    $mapa[$chave]['entradas'] += (float) $entrada;
    $mapa[$chave]['saidas'] += (float) $saida;
    $mapa[$chave]['lucro'] = $mapa[$chave]['entradas'] - $mapa[$chave]['saidas'];
    $mapa[$chave]['qtd_entrada'] += (int) $quantidadeEntrada;
    $mapa[$chave]['qtd_saida'] += (int) $quantidadeSaida;
}

function add_dia(&$mapa, $data, $entrada, $saida) {
    if (!$data) return;
    if (!isset($mapa[$data])) {
        $mapa[$data] = ['data' => $data, 'entradas' => 0.0, 'saidas' => 0.0, 'lucro' => 0.0];
    }
    $mapa[$data]['entradas'] += (float) $entrada;
    $mapa[$data]['saidas'] += (float) $saida;
    $mapa[$data]['lucro'] = $mapa[$data]['entradas'] - $mapa[$data]['saidas'];
}

function add_hora(&$mapa, $dataHora, $entrada, $saida) {
    if (!$dataHora) return;
    $hora = date('Y-m-d H:00:00', strtotime($dataHora));
    if (!isset($mapa[$hora])) {
        $mapa[$hora] = ['hora' => $hora, 'entradas' => 0.0, 'saidas' => 0.0, 'lucro' => 0.0];
    }
    $mapa[$hora]['entradas'] += (float) $entrada;
    $mapa[$hora]['saidas'] += (float) $saida;
    $mapa[$hora]['lucro'] = $mapa[$hora]['entradas'] - $mapa[$hora]['saidas'];
}

$acao = trim($_GET['acao'] ?? 'gerar');

if ($acao === 'filtros') {
    $categorias = [];
    $stmt = $conn->prepare('SELECT id, nome, tipo FROM categoria_movimentacao WHERE clube_id = ? ORDER BY nome ASC');
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) $categorias[] = $row;
    $stmt->close();

    $produtos = [];
    $stmt = $conn->prepare('SELECT id, nome, preco_original, preco_venda, ativo FROM produto WHERE clube_id = ? ORDER BY nome ASC');
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) $produtos[] = $row;
    $stmt->close();

    $eventos = [];
    $stmt = $conn->prepare(
        'SELECT e.id, e.nome, e.data_evento, e.ativo
         FROM evento e
         INNER JOIN evento_clube ec ON ec.evento_id = e.id
         WHERE ec.clube_id = ?
         ORDER BY e.data_evento DESC, e.id DESC'
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) $eventos[] = $row;
    $stmt->close();

    echo json_encode(['categorias' => $categorias, 'produtos' => $produtos, 'eventos' => $eventos], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit;
}

$inicio = normalizar_data($_GET['inicio'] ?? '');
$fim = normalizar_data($_GET['fim'] ?? '');
$categoria_id = (int) ($_GET['categoria_id'] ?? 0);
$produto_id = (int) ($_GET['produto_id'] ?? 0);
$evento_id = (int) ($_GET['evento_id'] ?? 0);

$params = [];
$types = '';
$whereMov = 'm.clube_id = ?';
$params[] = $clube_id; $types .= 'i';

if ($evento_id > 0) {
    $stmtEvento = $conn->prepare(
        'SELECT e.id, e.nome, e.data_evento, e.ativo
         FROM evento e
         INNER JOIN evento_clube ec ON ec.evento_id = e.id
         WHERE e.id = ? AND ec.clube_id = ? LIMIT 1'
    );
    $stmtEvento->bind_param('ii', $evento_id, $clube_id);
    $stmtEvento->execute();
    $evento = $stmtEvento->get_result()->fetch_assoc();
    $stmtEvento->close();
    if (!$evento) {
        http_response_code(404);
        echo json_encode(['erro' => 'Evento não encontrado para este clube'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $produtosMapa = [];
    $diasMapa = [];
    $horasMapa = [];
    $categoriasMapa = [];
    $totalEntradas = 0.0;
    $totalSaidas = 0.0;

    $sql = "SELECT emp.*, DATE(emp.criado_em) data_mov,
                   COALESCE(p.nome, ep.nome, 'Produto removido') nome
            FROM evento_movimento_produto emp
            LEFT JOIN produto p ON emp.origem = 'fixo' AND p.id = emp.produto_id
            LEFT JOIN evento_produto ep ON emp.origem = 'evento' AND ep.id = emp.produto_id
            WHERE emp.evento_id = ? AND emp.clube_id = ?";
    $typesEv = 'ii';
    $paramsEv = [$evento_id, $clube_id];
    if ($produto_id > 0) {
        $sql .= " AND emp.produto_id = ?";
        $typesEv .= 'i';
        $paramsEv[] = $produto_id;
    }
    $sql .= " ORDER BY emp.criado_em ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($typesEv, ...$paramsEv);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($m = $res->fetch_assoc()) {
        $valorEntrada = $m['tipo'] === 'saida' ? (float)$m['quantidade'] * (float)$m['valor_unitario'] : 0.0;
        $valorSaida = $m['tipo'] === 'entrada' ? (float)$m['quantidade'] * (float)$m['custo_unitario'] : 0.0;
        $totalEntradas += $valorEntrada;
        $totalSaidas += $valorSaida;
        add_produto($produtosMapa, $m['produto_id'], $m['nome'], $m['origem'], $valorEntrada, $valorSaida, $m['tipo'] === 'entrada' ? $m['quantidade'] : 0, $m['tipo'] === 'saida' ? $m['quantidade'] : 0);
        add_dia($diasMapa, $m['data_mov'], $valorEntrada, $valorSaida);
        add_hora($horasMapa, $m['criado_em'], $valorEntrada, $valorSaida);
    }
    $stmt->close();

    $produtos = array_values($produtosMapa);
    usort($produtos, fn($a, $b) => $b['lucro'] <=> $a['lucro']);
    $dias = array_values($diasMapa);
    usort($dias, fn($a, $b) => strcmp($a['data'], $b['data']));
    $horas = array_values($horasMapa);
    usort($horas, fn($a, $b) => strcmp($a['hora'], $b['hora']));

    echo json_encode([
        'modo' => 'evento',
        'evento' => $evento,
        'resumo' => ['entradas' => dinheiro($totalEntradas), 'saidas' => dinheiro($totalSaidas), 'lucro' => dinheiro($totalEntradas - $totalSaidas)],
        'produtos' => $produtos,
        'dias' => $dias,
        'horas' => $horas,
        'categorias' => [],
        'movimentacoes' => [],
        'filtros_aplicados' => ['evento_id' => $evento_id, 'produto_id' => $produto_id],
    ], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit;
}

if ($inicio) { $whereMov .= ' AND m.data >= ?'; $params[] = $inicio; $types .= 's'; }
if ($fim) { $whereMov .= ' AND m.data <= ?'; $params[] = $fim; $types .= 's'; }
if ($categoria_id > 0) { $whereMov .= ' AND m.categoria_id = ?'; $params[] = $categoria_id; $types .= 'i'; }
if ($produto_id > 0) { $whereMov .= ' AND 1 = 0'; }

$movimentacoes = [];
$categoriasMapa = [];
$diasMapa = [];
$produtosMapa = [];
$totalEntradas = 0.0;
$totalSaidas = 0.0;

$sqlMov = "SELECT m.id, m.tipo, m.descricao, m.valor, m.data, m.evento_id,
                  cm.id categoria_id, cm.nome categoria_nome
           FROM movimentacao m
           LEFT JOIN categoria_movimentacao cm ON cm.id = m.categoria_id
           WHERE $whereMov
           ORDER BY m.data ASC, m.id ASC";
$stmt = $conn->prepare($sqlMov);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$res = $stmt->get_result();
while ($m = $res->fetch_assoc()) {
    $entrada = $m['tipo'] === 'receita' ? (float)$m['valor'] : 0.0;
    $saida = $m['tipo'] === 'despesa' ? (float)$m['valor'] : 0.0;
    $totalEntradas += $entrada;
    $totalSaidas += $saida;
    add_dia($diasMapa, $m['data'], $entrada, $saida);
    $catId = $m['categoria_id'] ?: 0;
    $catNome = $m['categoria_nome'] ?: 'Sem categoria';
    if (!isset($categoriasMapa[$catId])) $categoriasMapa[$catId] = ['categoria_id' => $catId, 'nome' => $catNome, 'entradas' => 0.0, 'saidas' => 0.0, 'lucro' => 0.0];
    $categoriasMapa[$catId]['entradas'] += $entrada;
    $categoriasMapa[$catId]['saidas'] += $saida;
    $categoriasMapa[$catId]['lucro'] = $categoriasMapa[$catId]['entradas'] - $categoriasMapa[$catId]['saidas'];
    $movimentacoes[] = $m;
}
$stmt->close();

// Produtos fixos não têm uma tabela própria de movimentos globais; por isso o relatório usa o historico_log gerado pelo frontend.
if ($categoria_id === 0) {
    $sqlLogs = "SELECT id, entidade_id, dados, DATE(criado_em) data_mov
                FROM historico_log
                WHERE clube_id = ? AND entidade = 'produto' AND acao = 'movimentar'";
    $typesLog = 'i';
    $paramsLog = [$clube_id];
    if ($inicio) { $sqlLogs .= ' AND DATE(criado_em) >= ?'; $typesLog .= 's'; $paramsLog[] = $inicio; }
    if ($fim) { $sqlLogs .= ' AND DATE(criado_em) <= ?'; $typesLog .= 's'; $paramsLog[] = $fim; }
    if ($produto_id > 0) { $sqlLogs .= ' AND entidade_id = ?'; $typesLog .= 'i'; $paramsLog[] = $produto_id; }
    $sqlLogs .= ' ORDER BY criado_em ASC, id ASC';
    $stmt = $conn->prepare($sqlLogs);
    $stmt->bind_param($typesLog, ...$paramsLog);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($l = $res->fetch_assoc()) {
        $dados = json_decode($l['dados'] ?? '', true);
        if (!is_array($dados)) continue;
        $payload = $dados['payload'] ?? [];
        $resultado = $dados['resultado'] ?? [];
        $tipoProd = $payload['tipo'] ?? '';
        $idProd = (int)($payload['id'] ?? $l['entidade_id'] ?? 0);
        if ($idProd <= 0 || !in_array($tipoProd, ['entrada', 'saida'], true)) continue;
        $valor = (float)($resultado['valor_movimento'] ?? 0);
        if ($valor <= 0) continue;
        $nome = $resultado['produto']['nome'] ?? ('Produto #' . $idProd);
        $qtd = (int)($payload['quantidade'] ?? 0);
        $entrada = $tipoProd === 'saida' ? $valor : 0.0;
        $saida = $tipoProd === 'entrada' ? $valor : 0.0;
        $totalEntradas += $entrada;
        $totalSaidas += $saida;
        add_produto($produtosMapa, $idProd, $nome, 'fixo', $entrada, $saida, $tipoProd === 'entrada' ? $qtd : 0, $tipoProd === 'saida' ? $qtd : 0);
        add_dia($diasMapa, $l['data_mov'], $entrada, $saida);
    }
    $stmt->close();
}

$produtos = array_values($produtosMapa);
usort($produtos, fn($a, $b) => $b['lucro'] <=> $a['lucro']);
$dias = array_values($diasMapa);
usort($dias, fn($a, $b) => strcmp($a['data'], $b['data']));
$categorias = array_values($categoriasMapa);
usort($categorias, fn($a, $b) => $b['lucro'] <=> $a['lucro']);

echo json_encode([
    'modo' => 'geral',
    'resumo' => ['entradas' => dinheiro($totalEntradas), 'saidas' => dinheiro($totalSaidas), 'lucro' => dinheiro($totalEntradas - $totalSaidas)],
    'produtos' => $produtos,
    'dias' => $dias,
    'categorias' => $categorias,
    'movimentacoes' => $produto_id > 0 ? [] : $movimentacoes,
    'filtros_aplicados' => ['inicio' => $inicio, 'fim' => $fim, 'categoria_id' => $categoria_id, 'produto_id' => $produto_id],
], JSON_UNESCAPED_UNICODE);

$conn->close();
