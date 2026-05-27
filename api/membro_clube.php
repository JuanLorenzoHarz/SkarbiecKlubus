<?php
require 'config.php';
require_once 'log_helper.php';

session_start();

if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    http_response_code(401);
    echo json_encode(['erro' => 'Não autenticado']);
    exit;
}

$usuario_logado_id = (int) $_SESSION['user_id'];
$clube_id = (int) $_SESSION['clube_id'];

$stmtAuth = $conn->prepare(
    "SELECT
        uc.id,
        uc.status,
        uc.cargo_id,
        COALESCE(c.perm_aprovar_membros, 0) AS perm_aprovar_membros,
        COALESCE(c.perm_gerenciar_cargos, 0) AS perm_gerenciar_cargos
     FROM usuario_clube uc
     LEFT JOIN cargo c ON c.id = uc.cargo_id
     WHERE uc.usuario_id = ? AND uc.clube_id = ?
     LIMIT 1"
);
$stmtAuth->bind_param('ii', $usuario_logado_id, $clube_id);
$stmtAuth->execute();
$authResult = $stmtAuth->get_result();

if ($authResult->num_rows === 0) {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário não possui vínculo com este clube']);
    exit;
}

$auth = $authResult->fetch_assoc();

if ($auth['status'] !== 'ativo') {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário sem vínculo ativo com este clube']);
    exit;
}

$podeGerenciarMembros = (int) $auth['perm_aprovar_membros'] === 1 || (int) $auth['perm_gerenciar_cargos'] === 1;

if (!$podeGerenciarMembros) {
    http_response_code(403);
    echo json_encode(['erro' => 'Sem permissão para adicionar usuários ao clube']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $conn->prepare(
        "SELECT
            uc.id,
            u.id AS usuario_id,
            u.nome,
            u.sobrenome,
            u.email,
            uc.status,
            uc.vinculado_em,
            c.id AS cargo_id,
            c.nome AS cargo_nome
         FROM usuario_clube uc
         INNER JOIN usuario u ON u.id = uc.usuario_id
         LEFT JOIN cargo c ON c.id = uc.cargo_id
         WHERE uc.clube_id = ?
         ORDER BY u.nome ASC, u.sobrenome ASC"
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $membros = [];
    while ($row = $result->fetch_assoc()) {
        $membros[] = $row;
    }

    echo json_encode(['membros' => $membros]);
    $stmt->close();
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Método não permitido']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

$nome = trim($data['nome'] ?? '');
$sobrenome = trim($data['sobrenome'] ?? '');
$email = trim($data['email'] ?? '');
$cargo_id = isset($data['cargo_id']) && $data['cargo_id'] !== '' ? (int) $data['cargo_id'] : null;

if ($nome === '' || $sobrenome === '' || $email === '') {
    http_response_code(400);
    echo json_encode(['erro' => 'Preencha nome, sobrenome e email']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['erro' => 'Email inválido']);
    exit;
}

if ($cargo_id !== null) {
    $stmtCargo = $conn->prepare('SELECT id, nome FROM cargo WHERE id = ? AND clube_id = ? LIMIT 1');
    $stmtCargo->bind_param('ii', $cargo_id, $clube_id);
    $stmtCargo->execute();
    $cargoResult = $stmtCargo->get_result();

    if ($cargoResult->num_rows === 0) {
        http_response_code(400);
        echo json_encode(['erro' => 'Cargo inválido para este clube']);
        exit;
    }

    $stmtCargo->close();
}

$conn->begin_transaction();

try {
    $stmtUsuario = $conn->prepare('SELECT id, nome, sobrenome FROM usuario WHERE email = ? LIMIT 1');
    $stmtUsuario->bind_param('s', $email);
    $stmtUsuario->execute();
    $usuarioResult = $stmtUsuario->get_result();

    $usuario_id = null;
    $senha_temporaria = null;
    $usuario_criado = false;

    if ($usuarioResult->num_rows > 0) {
        $usuario = $usuarioResult->fetch_assoc();
        $usuario_id = (int) $usuario['id'];
    } else {
        $senha_temporaria = 'TMP' . strtoupper(bin2hex(random_bytes(4)));
        $senha_hash = password_hash($senha_temporaria, PASSWORD_DEFAULT);

        $stmtNovoUsuario = $conn->prepare(
            'INSERT INTO usuario (nome, sobrenome, email, senha_hash) VALUES (?, ?, ?, ?)'
        );
        $stmtNovoUsuario->bind_param('ssss', $nome, $sobrenome, $email, $senha_hash);

        if (!$stmtNovoUsuario->execute()) {
            throw new Exception('Erro ao criar usuário');
        }

        $usuario_id = (int) $stmtNovoUsuario->insert_id;
        $usuario_criado = true;
        $stmtNovoUsuario->close();
    }

    $stmtVinculo = $conn->prepare(
        'SELECT id, status FROM usuario_clube WHERE usuario_id = ? AND clube_id = ? LIMIT 1'
    );
    $stmtVinculo->bind_param('ii', $usuario_id, $clube_id);
    $stmtVinculo->execute();
    $vinculoResult = $stmtVinculo->get_result();

    if ($vinculoResult->num_rows > 0) {
        $vinculo = $vinculoResult->fetch_assoc();

        if ($vinculo['status'] === 'ativo') {
            $conn->rollback();
            http_response_code(409);
            echo json_encode(['erro' => 'Este usuário já está vinculado a este clube']);
            exit;
        }

        $vinculo_id = (int) $vinculo['id'];
        $stmtAtualiza = $conn->prepare(
            'UPDATE usuario_clube
             SET cargo_id = ?, status = "ativo"
             WHERE id = ?'
        );
        $stmtAtualiza->bind_param('ii', $cargo_id, $vinculo_id);

        if (!$stmtAtualiza->execute()) {
            throw new Exception('Erro ao reativar vínculo do usuário com o clube');
        }

        $stmtAtualiza->close();
    } else {
        $stmtNovoVinculo = $conn->prepare(
            'INSERT INTO usuario_clube (usuario_id, clube_id, cargo_id, status)
             VALUES (?, ?, ?, "ativo")'
        );
        $stmtNovoVinculo->bind_param('iii', $usuario_id, $clube_id, $cargo_id);

        if (!$stmtNovoVinculo->execute()) {
            throw new Exception('Erro ao vincular usuário ao clube');
        }

        $stmtNovoVinculo->close();
    }

    $conn->commit();

    echo json_encode([
        'sucesso' => true,
        'usuario_criado' => $usuario_criado,
        'senha_temporaria' => $senha_temporaria,
        'mensagem' => $usuario_criado
            ? 'Usuário criado e vinculado ao clube com sucesso'
            : 'Usuário vinculado ao clube com sucesso',
    ]);
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode([
        'erro' => 'Erro ao adicionar usuário ao clube',
        'detalhe' => $e->getMessage(),
    ]);
}

$conn->close();
