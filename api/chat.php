<?php
/**
 * chat.php — API de Chat entre Clubes
 * Endpoints:
 *   GET  ?acao=conversas                  → lista conversas do usuário logado
 *   GET  ?acao=mensagens&conversa_id=N    → mensagens de uma conversa
 *   GET  ?acao=buscar_membros&q=termo     → busca usuários de outros clubes
 *   POST {acao:"nova_conversa", destinatario_id:N}   → cria ou retorna conversa
 *   POST {acao:"enviar", conversa_id:N, conteudo:"…"} → envia mensagem
 *   POST {acao:"marcar_lidas", conversa_id:N}         → marca msgs como lidas
 */

require 'config.php';
session_start();

// ─── Autenticação ────────────────────────────────────────────────────────────
if (!isset($_SESSION['user_id'], $_SESSION['clube_id'])) {
    json_error_response(401, 'Não autenticado');
}

$me_id      = (int) $_SESSION['user_id'];
$me_clube   = (int) $_SESSION['clube_id'];

// Confirma que o usuário ainda está ativo no clube
$stmtMe = $conn->prepare(
    "SELECT id FROM usuario_clube
     WHERE usuario_id = ? AND clube_id = ? AND status = 'ativo'
     LIMIT 1"
);
$stmtMe->bind_param('ii', $me_id, $me_clube);
$stmtMe->execute();
if ($stmtMe->get_result()->num_rows === 0) {
    json_error_response(403, 'Usuário sem vínculo ativo com o clube');
}
$stmtMe->close();

// ─── Roteamento ──────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $acao = $_GET['acao'] ?? '';

    if ($acao === 'conversas') {
        listarConversas($conn, $me_id);
    } elseif ($acao === 'mensagens') {
        $conversa_id = (int) ($_GET['conversa_id'] ?? 0);
        if ($conversa_id <= 0) {
            json_error_response(400, 'conversa_id inválido');
        }
        listarMensagens($conn, $me_id, $conversa_id);
    } elseif ($acao === 'buscar_membros') {
        $q = trim($_GET['q'] ?? '');
        buscarMembros($conn, $me_id, $me_clube, $q);
    } else {
        json_error_response(400, 'Ação GET inválida');
    }

} elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        json_error_response(400, 'JSON inválido');
    }

    $acao = $body['acao'] ?? '';

    if ($acao === 'nova_conversa') {
        $dest_id = (int) ($body['destinatario_id'] ?? 0);
        novaConversa($conn, $me_id, $me_clube, $dest_id);
    } elseif ($acao === 'enviar') {
        $conversa_id = (int) ($body['conversa_id'] ?? 0);
        $conteudo    = trim($body['conteudo'] ?? '');
        enviarMensagem($conn, $me_id, $me_clube, $conversa_id, $conteudo);
    } elseif ($acao === 'marcar_lidas') {
        $conversa_id = (int) ($body['conversa_id'] ?? 0);
        marcarLidas($conn, $me_id, $conversa_id);
    } else {
        json_error_response(400, 'Ação POST inválida');
    }

} else {
    json_error_response(405, 'Método não permitido');
}

// ─── Funções ─────────────────────────────────────────────────────────────────

/**
 * Lista todas as conversas do usuário logado com dados resumidos.
 */
function listarConversas(mysqli $conn, int $me_id): void
{
    $stmt = $conn->prepare(
        "SELECT
            cv.id,
            cv.ultima_msg_em,
            -- Dados do outro participante
            IF(cv.usuario_a_id = ?, cv.usuario_b_id, cv.usuario_a_id)  AS outro_usuario_id,
            IF(cv.usuario_a_id = ?, clb.id,           cla.id)            AS outro_clube_id,
            IF(cv.usuario_a_id = ?,
                CONCAT(ub.nome, ' ', ub.sobrenome),
                CONCAT(ua.nome, ' ', ua.sobrenome))                     AS outro_nome,
            IF(cv.usuario_a_id = ?, clb.nome, cla.nome)                 AS outro_clube_nome,
            -- Última mensagem
            (SELECT m.conteudo FROM chat_mensagem m
             WHERE m.conversa_id = cv.id
             ORDER BY m.enviado_em DESC LIMIT 1)                        AS ultima_msg,
            -- Não lidas pelo usuário logado
            (SELECT COUNT(*) FROM chat_mensagem m
             WHERE m.conversa_id = cv.id
               AND m.remetente_id <> ?
               AND m.lido = 0)                                          AS nao_lidas
        FROM chat_conversa cv
        INNER JOIN usuario ua  ON ua.id  = cv.usuario_a_id
        INNER JOIN usuario ub  ON ub.id  = cv.usuario_b_id
        INNER JOIN clube   cla ON cla.id = cv.clube_a_id
        INNER JOIN clube   clb ON clb.id = cv.clube_b_id
        WHERE cv.usuario_a_id = ? OR cv.usuario_b_id = ?
        ORDER BY COALESCE(cv.ultima_msg_em, cv.criado_em) DESC"
    );
    $stmt->bind_param(
        'iiiiiii',
        $me_id, $me_id, $me_id, $me_id,
        $me_id, $me_id, $me_id
    );
    $stmt->execute();
    $result = $stmt->get_result();
    $lista  = [];
    while ($row = $result->fetch_assoc()) {
        $row['nao_lidas'] = (int) $row['nao_lidas'];
        $lista[] = $row;
    }
    $stmt->close();
    echo json_encode(['conversas' => $lista], JSON_UNESCAPED_UNICODE);
}

/**
 * Retorna mensagens de uma conversa (valida participação).
 */
function listarMensagens(mysqli $conn, int $me_id, int $conversa_id): void
{
    // Valida participação
    assertParticipante($conn, $me_id, $conversa_id);

    $stmt = $conn->prepare(
        "SELECT
            m.id,
            m.remetente_id,
            CONCAT(u.nome, ' ', u.sobrenome) AS remetente_nome,
            cl.nome                           AS clube_origem_nome,
            m.conteudo,
            m.enviado_em,
            m.lido,
            m.lido_em
        FROM chat_mensagem m
        INNER JOIN usuario u  ON u.id  = m.remetente_id
        INNER JOIN clube   cl ON cl.id = m.clube_origem_id
        WHERE m.conversa_id = ?
        ORDER BY m.enviado_em ASC"
    );
    $stmt->bind_param('i', $conversa_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $msgs   = [];
    while ($row = $result->fetch_assoc()) {
        $row['lido']    = (bool) $row['lido'];
        $row['proprio'] = ((int) $row['remetente_id'] === $me_id);
        $msgs[] = $row;
    }
    $stmt->close();
    echo json_encode(['mensagens' => $msgs, 'conversa_id' => $conversa_id], JSON_UNESCAPED_UNICODE);
}

/**
 * Busca membros de outros clubes (para iniciar conversa).
 */
function buscarMembros(mysqli $conn, int $me_id, int $me_clube, string $q): void
{
    $like = '%' . $conn->real_escape_string($q) . '%';
    $stmt = $conn->prepare(
        "SELECT
            u.id,
            CONCAT(u.nome, ' ', u.sobrenome) AS nome_completo,
            u.email,
            cl.nome  AS clube_nome,
            cl.codigo AS clube_codigo
        FROM usuario u
        INNER JOIN usuario_clube uc ON uc.usuario_id = u.id AND uc.status = 'ativo'
        INNER JOIN clube cl         ON cl.id = uc.clube_id
        WHERE uc.clube_id <> ?
          AND u.id        <> ?
          AND (u.nome LIKE ? OR u.sobrenome LIKE ? OR u.email LIKE ?
               OR cl.nome LIKE ? OR cl.codigo LIKE ?)
        ORDER BY cl.nome ASC, u.nome ASC
        LIMIT 30"
    );
    $stmt->bind_param('iisssss', $me_clube, $me_id, $like, $like, $like, $like, $like);
    $stmt->execute();
    $result  = $stmt->get_result();
    $membros = [];
    while ($row = $result->fetch_assoc()) {
        $membros[] = $row;
    }
    $stmt->close();
    echo json_encode(['membros' => $membros], JSON_UNESCAPED_UNICODE);
}

/**
 * Cria ou retorna conversa existente entre me_id e dest_id.
 */
function novaConversa(mysqli $conn, int $me_id, int $me_clube, int $dest_id): void
{
    if ($dest_id <= 0) {
        json_error_response(400, 'destinatario_id inválido');
    }
    if ($dest_id === $me_id) {
        json_error_response(400, 'Não é possível iniciar conversa consigo mesmo');
    }

    // Verifica se destinatário existe e está ativo em algum clube
    $stmtDest = $conn->prepare(
        "SELECT uc.clube_id
         FROM usuario_clube uc
         WHERE uc.usuario_id = ? AND uc.status = 'ativo'
         LIMIT 1"
    );
    $stmtDest->bind_param('i', $dest_id);
    $stmtDest->execute();
    $rDest = $stmtDest->get_result();
    if ($rDest->num_rows === 0) {
        json_error_response(404, 'Destinatário não encontrado ou inativo');
    }
    $dest_clube = (int) $rDest->fetch_assoc()['clube_id'];
    $stmtDest->close();

    // Garante que não é do mesmo clube
    if ($dest_clube === $me_clube) {
        json_error_response(400, 'O destinatário pertence ao mesmo clube');
    }

    // Verifica conversa existente (par ordenado)
    $a = min($me_id, $dest_id);
    $b = max($me_id, $dest_id);

    $stmtEx = $conn->prepare(
        "SELECT id FROM chat_conversa
         WHERE LEAST(usuario_a_id, usuario_b_id)    = ?
           AND GREATEST(usuario_a_id, usuario_b_id) = ?
         LIMIT 1"
    );
    $stmtEx->bind_param('ii', $a, $b);
    $stmtEx->execute();
    $rEx = $stmtEx->get_result();

    if ($rEx->num_rows > 0) {
        $conv_id = (int) $rEx->fetch_assoc()['id'];
        $stmtEx->close();
        echo json_encode(['conversa_id' => $conv_id, 'nova' => false], JSON_UNESCAPED_UNICODE);
        return;
    }
    $stmtEx->close();

    // Cria nova conversa
    $stmtIns = $conn->prepare(
        "INSERT INTO chat_conversa (usuario_a_id, clube_a_id, usuario_b_id, clube_b_id)
         VALUES (?, ?, ?, ?)"
    );
    $stmtIns->bind_param('iiii', $me_id, $me_clube, $dest_id, $dest_clube);
    $stmtIns->execute();
    $conv_id = (int) $conn->insert_id;
    $stmtIns->close();

    echo json_encode(['conversa_id' => $conv_id, 'nova' => true], JSON_UNESCAPED_UNICODE);
}

/**
 * Envia uma mensagem numa conversa.
 */
function enviarMensagem(mysqli $conn, int $me_id, int $me_clube, int $conversa_id, string $conteudo): void
{
    if ($conversa_id <= 0) {
        json_error_response(400, 'conversa_id inválido');
    }
    if ($conteudo === '') {
        json_error_response(400, 'Mensagem não pode ser vazia');
    }

    // Sanitiza (strip tags, limita tamanho)
    $conteudo = htmlspecialchars(strip_tags($conteudo), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    if (mb_strlen($conteudo) > 2000) {
        json_error_response(400, 'Mensagem muito longa (máximo 2000 caracteres)');
    }

    // Valida participação
    assertParticipante($conn, $me_id, $conversa_id);

    $stmt = $conn->prepare(
        "INSERT INTO chat_mensagem (conversa_id, remetente_id, clube_origem_id, conteudo)
         VALUES (?, ?, ?, ?)"
    );
    $stmt->bind_param('iiis', $conversa_id, $me_id, $me_clube, $conteudo);
    $stmt->execute();
    $msg_id = (int) $conn->insert_id;
    $stmt->close();

    echo json_encode([
        'sucesso'    => true,
        'mensagem_id' => $msg_id,
        'enviado_em' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Marca como lidas todas as mensagens recebidas pelo me_id nessa conversa.
 */
function marcarLidas(mysqli $conn, int $me_id, int $conversa_id): void
{
    if ($conversa_id <= 0) {
        json_error_response(400, 'conversa_id inválido');
    }
    assertParticipante($conn, $me_id, $conversa_id);

    $now  = date('Y-m-d H:i:s');
    $stmt = $conn->prepare(
        "UPDATE chat_mensagem
         SET lido = 1, lido_em = ?
         WHERE conversa_id = ?
           AND remetente_id <> ?
           AND lido = 0"
    );
    $stmt->bind_param('sii', $now, $conversa_id, $me_id);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['sucesso' => true], JSON_UNESCAPED_UNICODE);
}

/**
 * Verifica que me_id participa da conversa; aborta com 403 se não.
 */
function assertParticipante(mysqli $conn, int $me_id, int $conversa_id): void
{
    $stmt = $conn->prepare(
        "SELECT id FROM chat_conversa
         WHERE id = ? AND (usuario_a_id = ? OR usuario_b_id = ?)
         LIMIT 1"
    );
    $stmt->bind_param('iii', $conversa_id, $me_id, $me_id);
    $stmt->execute();
    if ($stmt->get_result()->num_rows === 0) {
        $stmt->close();
        json_error_response(403, 'Acesso negado a esta conversa');
    }
    $stmt->close();
}