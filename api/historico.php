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

$stmtAuth = $conn->prepare(
    "SELECT 1 FROM usuario_clube
     WHERE usuario_id = ? AND clube_id = ? AND status = 'ativo' LIMIT 1"
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['erro' => 'Método não permitido']);
    $conn->close();
    exit;
}

$entidade = trim($_GET['entidade'] ?? '');
$acao = trim($_GET['acao'] ?? '');
$busca = trim($_GET['busca'] ?? '');
$limite = isset($_GET['limite']) ? (int) $_GET['limite'] : 100;
$limite = max(10, min($limite, 300));

$sql = "SELECT
            h.id,
            h.acao,
            h.entidade,
            h.entidade_id,
            h.descricao,
            h.dados,
            h.criado_em,
            CONCAT(COALESCE(u.nome, 'Usuário'), ' ', COALESCE(u.sobrenome, '')) AS usuario_nome,
            u.email AS usuario_email
        FROM historico_log h
        LEFT JOIN usuario u ON u.id = h.usuario_id
        WHERE h.clube_id = ?";

$params = [$clube_id];
$types = 'i';

if ($entidade !== '') {
    $sql .= ' AND h.entidade = ?';
    $params[] = $entidade;
    $types .= 's';
}

if ($acao !== '') {
    $sql .= ' AND h.acao = ?';
    $params[] = $acao;
    $types .= 's';
}

if ($busca !== '') {
    $sql .= ' AND (h.descricao LIKE ? OR h.entidade LIKE ? OR h.acao LIKE ? OR u.nome LIKE ? OR u.sobrenome LIKE ? OR u.email LIKE ?)';
    $like = '%' . $busca . '%';
    for ($i = 0; $i < 6; $i++) {
        $params[] = $like;
        $types .= 's';
    }
}

$sql .= ' ORDER BY h.criado_em DESC, h.id DESC LIMIT ?';
$params[] = $limite;
$types .= 'i';

$stmt = $conn->prepare($sql);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();

$historico = [];
while ($row = $result->fetch_assoc()) {
    $row['dados'] = $row['dados'] ? json_decode($row['dados'], true) : null;
    $historico[] = $row;
}

$stmt->close();
$conn->close();

echo json_encode(['historico' => $historico]);
