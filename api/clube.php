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

$stmt = $conn->prepare(
    "SELECT
        c.id, c.nome, c.codigo, c.cidade, c.saldo_atual, c.valor_mensalidade_padrao,
        cg.id AS cargo_id,
        cg.nome AS cargo_nome,
        COALESCE(cg.perm_aprovar_membros, 0) AS perm_aprovar_membros,
        COALESCE(cg.perm_gerenciar_cargos, 0) AS perm_gerenciar_cargos,
        COALESCE(cg.perm_ver_movimentacoes, 0) AS perm_ver_movimentacoes,
        COALESCE(cg.perm_editar_movimentacoes, 0) AS perm_editar_movimentacoes,
        COALESCE(cg.perm_ver_relatorios, 0) AS perm_ver_relatorios,
        COALESCE(cg.perm_exportar_relatorios, 0) AS perm_exportar_relatorios,
        COALESCE(cg.perm_ver_mensalidades, 0) AS perm_ver_mensalidades,
        COALESCE(cg.perm_editar_mensalidades, 0) AS perm_editar_mensalidades,
        COALESCE(cg.perm_ver_gastos_fixos, 0) AS perm_ver_gastos_fixos,
        COALESCE(cg.perm_editar_gastos_fixos, 0) AS perm_editar_gastos_fixos,
        COALESCE(cg.perm_ver_produtos, 0) AS perm_ver_produtos,
        COALESCE(cg.perm_editar_produtos, 0) AS perm_editar_produtos,
        COALESCE(cg.perm_ver_eventos, 0) AS perm_ver_eventos,
        COALESCE(cg.perm_editar_eventos, 0) AS perm_editar_eventos
     FROM clube c
     INNER JOIN usuario_clube uc ON uc.clube_id = c.id
     LEFT JOIN cargo cg ON cg.id = uc.cargo_id AND cg.clube_id = c.id
     WHERE c.id = ? AND uc.usuario_id = ? AND uc.status = 'ativo'
     LIMIT 1"
);
$stmt->bind_param('ii', $clube_id, $usuario_id);
$stmt->execute();
$result = $stmt->get_result();
$clube = $result->fetch_assoc();

if (!$clube) {
    http_response_code(403);
    echo json_encode(['erro' => 'Clube não encontrado para o usuário autenticado']);
    exit;
}

$permissoes = [
    'perm_aprovar_membros' => (bool) $clube['perm_aprovar_membros'],
    'perm_gerenciar_cargos' => (bool) $clube['perm_gerenciar_cargos'],
    'perm_ver_movimentacoes' => (bool) $clube['perm_ver_movimentacoes'],
    'perm_editar_movimentacoes' => (bool) $clube['perm_editar_movimentacoes'],
    'perm_ver_relatorios' => (bool) $clube['perm_ver_relatorios'],
    'perm_exportar_relatorios' => (bool) $clube['perm_exportar_relatorios'],
    'perm_ver_mensalidades' => (bool) $clube['perm_ver_mensalidades'],
    'perm_editar_mensalidades' => (bool) $clube['perm_editar_mensalidades'],
    'perm_ver_gastos_fixos' => (bool) $clube['perm_ver_gastos_fixos'],
    'perm_editar_gastos_fixos' => (bool) $clube['perm_editar_gastos_fixos'],
    'perm_ver_produtos' => (bool) $clube['perm_ver_produtos'],
    'perm_editar_produtos' => (bool) $clube['perm_editar_produtos'],
    'perm_ver_eventos' => (bool) $clube['perm_ver_eventos'],
    'perm_editar_eventos' => (bool) $clube['perm_editar_eventos'],
];

$cargo = [
    'id' => $clube['cargo_id'] !== null ? (int) $clube['cargo_id'] : null,
    'nome' => $clube['cargo_nome'] ?? null,
];

foreach (array_keys($permissoes) as $campoPermissao) {
    unset($clube[$campoPermissao]);
}
unset($clube['cargo_id'], $clube['cargo_nome']);

echo json_encode([
    'clube' => $clube,
    'cargo' => $cargo,
    'permissoes' => $permissoes,
], JSON_UNESCAPED_UNICODE);
$stmt->close();
$conn->close();
