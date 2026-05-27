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
$mapaPermissoes = [
    'perm_aprovar_membros' => 'Aprovar membros',
    'perm_gerenciar_cargos' => 'Gerenciar cargos',
    'perm_ver_movimentacoes' => 'Ver movimentações',
    'perm_editar_movimentacoes' => 'Editar movimentações',
    'perm_ver_relatorios' => 'Ver relatórios',
    'perm_exportar_relatorios' => 'Exportar relatórios',
    'perm_ver_mensalidades' => 'Ver mensalidades',
    'perm_editar_mensalidades' => 'Editar mensalidades',
    'perm_ver_gastos_fixos' => 'Ver gastos fixos',
    'perm_editar_gastos_fixos' => 'Editar gastos fixos',
    'perm_ver_produtos' => 'Ver produtos',
    'perm_editar_produtos' => 'Editar produtos',
    'perm_ver_eventos' => 'Ver eventos',
    'perm_editar_eventos' => 'Editar eventos',
];

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
        'SELECT id, nome,
            perm_aprovar_membros,
            perm_gerenciar_cargos,
            perm_ver_movimentacoes,
            perm_editar_movimentacoes,
            perm_ver_relatorios,
            perm_exportar_relatorios,
            perm_ver_mensalidades,
            perm_editar_mensalidades,
            perm_ver_gastos_fixos,
            perm_editar_gastos_fixos,
            perm_ver_produtos,
            perm_editar_produtos,
            perm_ver_eventos,
            perm_editar_eventos
         FROM cargo
         WHERE clube_id = ?
         ORDER BY nome ASC'
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $cargos = [];
    while ($row = $result->fetch_assoc()) {
        $permissoesAtivas = [];
        foreach ($mapaPermissoes as $chave => $rotulo) {
            if ((int) $row[$chave] === 1) {
                $permissoesAtivas[] = $rotulo;
            }
            unset($row[$chave]);
        }

        $row['permissoes_ativas'] = $permissoesAtivas;
        $row['total_permissoes'] = count($permissoesAtivas);
        $cargos[] = $row;
    }

    echo json_encode(['cargos' => $cargos]);
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
if ($nome === '') {
    http_response_code(400);
    echo json_encode(['erro' => 'Preencha o nome do cargo']);
    $conn->close();
    exit;
}

$valoresPermissao = [];
foreach (array_keys($mapaPermissoes) as $chave) {
    $valoresPermissao[$chave] = !empty($data[$chave]) ? 1 : 0;
}

$stmt = $conn->prepare(
    'INSERT INTO cargo (
        clube_id, nome,
        perm_aprovar_membros,
        perm_gerenciar_cargos,
        perm_ver_movimentacoes,
        perm_editar_movimentacoes,
        perm_ver_relatorios,
        perm_exportar_relatorios,
        perm_ver_mensalidades,
        perm_editar_mensalidades,
        perm_ver_gastos_fixos,
        perm_editar_gastos_fixos,
        perm_ver_produtos,
        perm_editar_produtos,
        perm_ver_eventos,
        perm_editar_eventos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

$stmt->bind_param(
    'isiiiiiiiiiiiiii',
    $clube_id,
    $nome,
    $valoresPermissao['perm_aprovar_membros'],
    $valoresPermissao['perm_gerenciar_cargos'],
    $valoresPermissao['perm_ver_movimentacoes'],
    $valoresPermissao['perm_editar_movimentacoes'],
    $valoresPermissao['perm_ver_relatorios'],
    $valoresPermissao['perm_exportar_relatorios'],
    $valoresPermissao['perm_ver_mensalidades'],
    $valoresPermissao['perm_editar_mensalidades'],
    $valoresPermissao['perm_ver_gastos_fixos'],
    $valoresPermissao['perm_editar_gastos_fixos'],
    $valoresPermissao['perm_ver_produtos'],
    $valoresPermissao['perm_editar_produtos'],
    $valoresPermissao['perm_ver_eventos'],
    $valoresPermissao['perm_editar_eventos']
);

if (!$stmt->execute()) {
    if ((int) $conn->errno === 1062) {
        http_response_code(409);
        echo json_encode(['erro' => 'Já existe um cargo com esse nome para este clube']);
    } else {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao criar cargo', 'detalhe' => $stmt->error]);
    }
    $stmt->close();
    $conn->close();
    exit;
}

$permissoesAtivas = [];
foreach ($mapaPermissoes as $chave => $rotulo) {
    if ($valoresPermissao[$chave] === 1) {
        $permissoesAtivas[] = $rotulo;
    }
}

echo json_encode([
    'sucesso' => true,
    'cargo' => [
        'id' => $stmt->insert_id,
        'nome' => $nome,
        'permissoes_ativas' => $permissoesAtivas,
        'total_permissoes' => count($permissoesAtivas),
    ],
]);

$stmt->close();
$conn->close();
