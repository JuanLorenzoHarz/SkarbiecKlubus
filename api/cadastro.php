<?php
require 'config.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

$nome = trim($data['nome'] ?? '');
$sobrenome = trim($data['sobrenome'] ?? '');
$email = trim($data['email'] ?? '');
$senha = $data['senha'] ?? '';
$clube = $data['clube'] ?? null;

if ($nome === '' || $sobrenome === '' || $email === '' || $senha === '') {
    http_response_code(400);
    echo json_encode(['erro' => 'Preencha todos os campos obrigatórios']);
    exit;
}

$senha_hash = password_hash($senha, PASSWORD_DEFAULT);

$stmt = $conn->prepare('SELECT id FROM usuario WHERE email = ?');
$stmt->bind_param('s', $email);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['erro' => 'Email já cadastrado']);
    exit;
}

$stmt = $conn->prepare('INSERT INTO usuario (nome, sobrenome, email, senha_hash) VALUES (?, ?, ?, ?)');
$stmt->bind_param('ssss', $nome, $sobrenome, $email, $senha_hash);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['erro' => 'Erro ao criar usuário']);
    exit;
}

$usuario_id = $stmt->insert_id;

if (is_array($clube) && !empty($clube['nome']) && !empty($clube['cidade']) && !empty($clube['codigo'])) {
    $nome_clube = trim($clube['nome']);
    $cidade = trim($clube['cidade']);
    $codigo = strtoupper(trim($clube['codigo']));

    $stmt = $conn->prepare('SELECT id FROM clube WHERE codigo = ?');
    $stmt->bind_param('s', $codigo);
    $stmt->execute();
    $stmt->store_result();

    if ($stmt->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['erro' => 'Código do clube já existe']);
        exit;
    }

    $stmt = $conn->prepare('INSERT INTO clube (nome, codigo, cidade) VALUES (?, ?, ?)');
    $stmt->bind_param('sss', $nome_clube, $codigo, $cidade);

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao criar clube']);
        exit;
    }

    $clube_id = $stmt->insert_id;

    $stmt = $conn->prepare(
        "INSERT INTO cargo (
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
        ) VALUES (?, 'Administrador', 1,1,1,1,1,1,1,1,1,1,1,1,1,1)"
    );
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();

    $cargo_id = $stmt->insert_id;

    $stmt = $conn->prepare(
        "INSERT INTO usuario_clube (usuario_id, clube_id, cargo_id, status)
         VALUES (?, ?, ?, 'ativo')"
    );
    $stmt->bind_param('iii', $usuario_id, $clube_id, $cargo_id);
    $stmt->execute();
}

echo json_encode(['sucesso' => true]);
