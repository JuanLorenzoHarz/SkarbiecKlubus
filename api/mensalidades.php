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
    "SELECT
        uc.status,
        COALESCE(c.perm_ver_mensalidades, 0) AS perm_ver_mensalidades,
        COALESCE(c.perm_editar_mensalidades, 0) AS perm_editar_mensalidades
     FROM usuario_clube uc
     LEFT JOIN cargo c ON c.id = uc.cargo_id
     WHERE uc.usuario_id = ? AND uc.clube_id = ?
     LIMIT 1"
);
$stmtAuth->bind_param('ii', $usuario_id, $clube_id);
$stmtAuth->execute();
$auth = $stmtAuth->get_result()->fetch_assoc();
$stmtAuth->close();

if (!$auth || $auth['status'] !== 'ativo') {
    http_response_code(403);
    echo json_encode(['erro' => 'Usuário sem vínculo ativo com o clube']);
    exit;
}

$podeVer = (int) $auth['perm_ver_mensalidades'] === 1 || (int) $auth['perm_editar_mensalidades'] === 1;
$podeEditar = (int) $auth['perm_editar_mensalidades'] === 1;


function tabelaExiste(mysqli $conn, string $nomeTabela): bool
{
    $stmt = $conn->prepare(
        'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?'
    );
    $stmt->bind_param('s', $nomeTabela);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return ((int) ($row['total'] ?? 0)) > 0;
}

function colunaExiste(mysqli $conn, string $nomeTabela, string $nomeColuna): bool
{
    $stmt = $conn->prepare(
        'SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    );
    $stmt->bind_param('ss', $nomeTabela, $nomeColuna);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return ((int) ($row['total'] ?? 0)) > 0;
}

function garantirEstruturaMensalidades(mysqli $conn): void
{
    if (!colunaExiste($conn, 'clube', 'valor_mensalidade_padrao')) {
        $conn->query('ALTER TABLE clube ADD COLUMN valor_mensalidade_padrao DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    }

    if (!tabelaExiste($conn, 'membro')) {
        $conn->query(
            "CREATE TABLE membro (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clube_id INT NOT NULL,
                nome VARCHAR(100) NOT NULL,
                sobrenome VARCHAR(100) NOT NULL,
                email VARCHAR(150) NULL,
                telefone VARCHAR(30) NULL,
                data_entrada DATE NOT NULL,
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_membro_clube_email (clube_id, email),
                CONSTRAINT fk_membro_clube FOREIGN KEY (clube_id) REFERENCES clube(id) ON DELETE CASCADE
            )"
        );
    }

    if (tabelaExiste($conn, 'membro')) {
        if (!colunaExiste($conn, 'membro', 'data_entrada')) {
            $conn->query('ALTER TABLE membro ADD COLUMN data_entrada DATE NULL AFTER telefone');
            $conn->query('UPDATE membro SET data_entrada = DATE(criado_em) WHERE data_entrada IS NULL');
            $conn->query('ALTER TABLE membro MODIFY COLUMN data_entrada DATE NOT NULL');
        }

        if (!colunaExiste($conn, 'membro', 'ativo')) {
            $conn->query('ALTER TABLE membro ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE AFTER data_entrada');
        }
    }

    if (!tabelaExiste($conn, 'mensalidade_membro')) {
        $conn->query(
            "CREATE TABLE mensalidade_membro (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clube_id INT NOT NULL,
                membro_id INT NOT NULL,
                valor DECIMAL(10,2) NOT NULL,
                mes_referencia DATE NOT NULL,
                data_vencimento DATE NOT NULL,
                status ENUM('pendente','pago','atrasado','isento') NOT NULL DEFAULT 'pendente',
                pago_em DATETIME NULL,
                observacao VARCHAR(255) NULL,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_mensalidade_membro_mes (membro_id, mes_referencia),
                CONSTRAINT fk_mensalidade_membro_clube FOREIGN KEY (clube_id) REFERENCES clube(id) ON DELETE CASCADE,
                CONSTRAINT fk_mensalidade_membro_membro FOREIGN KEY (membro_id) REFERENCES membro(id) ON DELETE CASCADE
            )"
        );
    }
}

garantirEstruturaMensalidades($conn);

function obterSaldoAtual(mysqli $conn, int $clube_id): float
{
    $stmt = $conn->prepare('SELECT saldo_atual FROM clube WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $saldo = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $saldo ? (float) $saldo['saldo_atual'] : 0.0;
}

function ultimoDiaMes(string $anoMes): int
{
    $data = DateTime::createFromFormat('Y-m-d', $anoMes . '-01');
    return (int) $data->format('t');
}

function normalizarCompetencia(string $data): ?string
{
    if ($data === '') {
        return null;
    }

    $dt = DateTime::createFromFormat('Y-m-d', $data);
    if (!$dt) {
        return null;
    }

    return $dt->format('Y-m-01');
}

function sincronizarMensalidadesAutomaticas(mysqli $conn, int $clube_id): void
{
    $stmtValor = $conn->prepare('SELECT valor_mensalidade_padrao FROM clube WHERE id = ? LIMIT 1');
    $stmtValor->bind_param('i', $clube_id);
    $stmtValor->execute();
    $clube = $stmtValor->get_result()->fetch_assoc();
    $stmtValor->close();

    $valorPadrao = $clube ? (float) $clube['valor_mensalidade_padrao'] : 0.0;
    if ($valorPadrao <= 0) {
        return;
    }

    $stmtMembros = $conn->prepare(
        "SELECT id, data_entrada, ativo, criado_em
         FROM membro
         WHERE clube_id = ?"
    );
    $stmtMembros->bind_param('i', $clube_id);
    $stmtMembros->execute();
    $result = $stmtMembros->get_result();

    $hoje = new DateTime('today');
    $competenciaAtual = new DateTime($hoje->format('Y-m-01'));

    $stmtExiste = $conn->prepare('SELECT id FROM mensalidade_membro WHERE membro_id = ? AND clube_id = ? AND mes_referencia = ? LIMIT 1');
    $stmtInsert = $conn->prepare(
        'INSERT INTO mensalidade_membro (clube_id, membro_id, valor, mes_referencia, data_vencimento, status, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    while ($membro = $result->fetch_assoc()) {
        if ((int) $membro['ativo'] !== 1) {
            continue;
        }

        $dataEntradaBase = $membro['data_entrada'] ?: substr((string) $membro['criado_em'], 0, 10);
        $dataEntrada = DateTime::createFromFormat('Y-m-d', $dataEntradaBase);
        if (!$dataEntrada) {
            continue;
        }

        $diaVencimento = (int) $dataEntrada->format('d');
        $competencia = new DateTime($dataEntrada->format('Y-m-01'));

        while ($competencia <= $competenciaAtual) {
            $mesReferencia = $competencia->format('Y-m-01');
            $ultimoDia = (int) $competencia->format('t');
            $diaAplicado = min($diaVencimento, $ultimoDia);
            $dataVencimento = $competencia->format('Y-m-') . str_pad((string) $diaAplicado, 2, '0', STR_PAD_LEFT);

            $stmtExiste->bind_param('iis', $membro['id'], $clube_id, $mesReferencia);
            $stmtExiste->execute();
            $existe = $stmtExiste->get_result()->fetch_assoc();

            if (!$existe) {
                $statusInicial = $dataVencimento < $hoje->format('Y-m-d') ? 'atrasado' : 'pendente';
                $observacao = 'Gerada automaticamente pelo sistema';
                $stmtInsert->bind_param('iidssss', $clube_id, $membro['id'], $valorPadrao, $mesReferencia, $dataVencimento, $statusInicial, $observacao);
                $stmtInsert->execute();
            }

            $competencia->modify('+1 month');
        }
    }

    $stmtMembros->close();
    $stmtExiste->close();
    $stmtInsert->close();

    $hojeStr = $hoje->format('Y-m-d');
    $stmtAtraso = $conn->prepare(
        "UPDATE mensalidade_membro
         SET status = 'atrasado'
         WHERE clube_id = ?
           AND status = 'pendente'
           AND data_vencimento < ?"
    );
    $stmtAtraso->bind_param('is', $clube_id, $hojeStr);
    $stmtAtraso->execute();
    $stmtAtraso->close();
}

function carregarDadosMensalidades(mysqli $conn, int $clube_id): array
{
    sincronizarMensalidadesAutomaticas($conn, $clube_id);

    $stmtClube = $conn->prepare('SELECT id, nome, valor_mensalidade_padrao, saldo_atual FROM clube WHERE id = ? LIMIT 1');
    $stmtClube->bind_param('i', $clube_id);
    $stmtClube->execute();
    $clube = $stmtClube->get_result()->fetch_assoc();
    $stmtClube->close();

    $stmtMembros = $conn->prepare(
        "SELECT
            m.id,
            m.nome,
            m.sobrenome,
            m.email,
            m.telefone,
            m.ativo,
            m.data_entrada,
            MAX(CASE WHEN mm.status = 'pago' THEN mm.mes_referencia END) AS ultima_mensalidade_paga,
            SUM(CASE WHEN mm.status IN ('pendente', 'atrasado') THEN 1 ELSE 0 END) AS mensalidades_em_aberto,
            COALESCE(SUM(CASE WHEN mm.status IN ('pendente', 'atrasado') THEN mm.valor ELSE 0 END), 0) AS total_em_aberto,
            MIN(CASE WHEN mm.status IN ('pendente', 'atrasado') THEN mm.data_vencimento END) AS proximo_vencimento
         FROM membro m
         LEFT JOIN mensalidade_membro mm ON mm.membro_id = m.id AND mm.clube_id = m.clube_id
         WHERE m.clube_id = ?
         GROUP BY m.id, m.nome, m.sobrenome, m.email, m.telefone, m.ativo, m.data_entrada
         ORDER BY m.nome ASC, m.sobrenome ASC"
    );
    $stmtMembros->bind_param('i', $clube_id);
    $stmtMembros->execute();
    $membrosResult = $stmtMembros->get_result();

    $membros = [];
    while ($row = $membrosResult->fetch_assoc()) {
        $row['mensalidades_em_aberto'] = (int) $row['mensalidades_em_aberto'];
        $row['total_em_aberto'] = (float) $row['total_em_aberto'];
        $membros[] = $row;
    }
    $stmtMembros->close();

    $stmtMensalidades = $conn->prepare(
        "SELECT mm.id, mm.membro_id, mm.valor, mm.mes_referencia, mm.data_vencimento, mm.status, mm.pago_em, mm.observacao,
                m.nome, m.sobrenome
         FROM mensalidade_membro mm
         INNER JOIN membro m ON m.id = mm.membro_id
         WHERE mm.clube_id = ?
         ORDER BY mm.data_vencimento DESC, m.nome ASC, m.sobrenome ASC"
    );
    $stmtMensalidades->bind_param('i', $clube_id);
    $stmtMensalidades->execute();
    $mensalidadesResult = $stmtMensalidades->get_result();

    $mensalidades = [];
    while ($row = $mensalidadesResult->fetch_assoc()) {
        $mensalidades[] = $row;
    }
    $stmtMensalidades->close();

    return [
        'clube' => $clube,
        'membros' => $membros,
        'mensalidades' => $mensalidades,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!$podeVer) {
        http_response_code(403);
        echo json_encode(['erro' => 'Sem permissão para visualizar mensalidades']);
        exit;
    }

    $dados = carregarDadosMensalidades($conn, $clube_id);
    echo json_encode([
        'clube' => $dados['clube'],
        'membros' => $dados['membros'],
        'mensalidades' => $dados['mensalidades'],
        'permissoes' => [
            'ver' => $podeVer,
            'editar' => $podeEditar,
        ],
    ]);
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Método não permitido']);
    exit;
}

if (!$podeEditar) {
    http_response_code(403);
    echo json_encode(['erro' => 'Sem permissão para editar mensalidades']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['erro' => 'JSON inválido']);
    exit;
}

$acao = trim($data['acao'] ?? '');

if ($acao === 'configurar_valor') {
    $valor = (float) ($data['valor_mensalidade_padrao'] ?? -1);
    if ($valor < 0) {
        http_response_code(400);
        echo json_encode(['erro' => 'Informe um valor de mensalidade válido']);
        exit;
    }

    $stmt = $conn->prepare('UPDATE clube SET valor_mensalidade_padrao = ? WHERE id = ?');
    $stmt->bind_param('di', $valor, $clube_id);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao salvar valor padrão da mensalidade']);
        exit;
    }
    $stmt->close();

    sincronizarMensalidadesAutomaticas($conn, $clube_id);

    echo json_encode(['sucesso' => true, 'valor_mensalidade_padrao' => $valor]);
    $conn->close();
    exit;
}

if ($acao === 'cadastrar_membro') {
    $nome = trim($data['nome'] ?? '');
    $sobrenome = trim($data['sobrenome'] ?? '');
    $email = trim($data['email'] ?? '');
    $emailBanco = $email !== '' ? $email : null;
    $telefone = trim($data['telefone'] ?? '');
    $ativo = isset($data['ativo']) ? (int) $data['ativo'] : 1;
    $dataEntradaInformada = trim($data['data_entrada'] ?? '');
    $dataEntrada = $dataEntradaInformada !== '' ? $dataEntradaInformada : date('Y-m-d');

    if ($nome === '' || $sobrenome === '') {
        http_response_code(400);
        echo json_encode(['erro' => 'Preencha nome e sobrenome do membro']);
        exit;
    }

    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['erro' => 'Email do membro inválido']);
        exit;
    }

    if (!DateTime::createFromFormat('Y-m-d', $dataEntrada)) {
        http_response_code(400);
        echo json_encode(['erro' => 'Data de entrada inválida']);
        exit;
    }

    $stmt = $conn->prepare(
        'INSERT INTO membro (clube_id, nome, sobrenome, email, telefone, ativo, data_entrada) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('issssis', $clube_id, $nome, $sobrenome, $emailBanco, $telefone, $ativo, $dataEntrada);

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao cadastrar membro', 'detalhe' => $stmt->error]);
        exit;
    }

    $novoId = (int) $stmt->insert_id;
    $stmt->close();

    sincronizarMensalidadesAutomaticas($conn, $clube_id);

    echo json_encode([
        'sucesso' => true,
        'membro' => [
            'id' => $novoId,
            'nome' => $nome,
            'sobrenome' => $sobrenome,
            'email' => $emailBanco,
            'telefone' => $telefone,
            'ativo' => $ativo,
            'data_entrada' => $dataEntrada,
        ],
    ]);
    $conn->close();
    exit;
}

if ($acao === 'sincronizar_automatico') {
    sincronizarMensalidadesAutomaticas($conn, $clube_id);
    $dados = carregarDadosMensalidades($conn, $clube_id);
    echo json_encode([
        'sucesso' => true,
        'clube' => $dados['clube'],
        'membros' => $dados['membros'],
        'mensalidades' => $dados['mensalidades'],
    ]);
    $conn->close();
    exit;
}

if ($acao === 'atualizar_status') {
    $id = (int) ($data['id'] ?? 0);
    $novoStatus = trim($data['status'] ?? '');

    if ($id <= 0 || !in_array($novoStatus, ['pendente', 'pago', 'atrasado', 'isento'], true)) {
        http_response_code(400);
        echo json_encode(['erro' => 'Dados inválidos para atualização de status']);
        exit;
    }

    $stmtAtual = $conn->prepare('SELECT id, valor, status, data_vencimento FROM mensalidade_membro WHERE id = ? AND clube_id = ? LIMIT 1');
    $stmtAtual->bind_param('ii', $id, $clube_id);
    $stmtAtual->execute();
    $mensalidade = $stmtAtual->get_result()->fetch_assoc();
    $stmtAtual->close();

    if (!$mensalidade) {
        http_response_code(404);
        echo json_encode(['erro' => 'Mensalidade não encontrada']);
        exit;
    }

    $statusAnterior = $mensalidade['status'];
    $valor = (float) $mensalidade['valor'];
    $ajusteSaldo = 0;

    if ($statusAnterior !== 'pago' && $novoStatus === 'pago') {
        $ajusteSaldo = $valor;
    } elseif ($statusAnterior === 'pago' && $novoStatus !== 'pago') {
        $ajusteSaldo = -$valor;
    }

    if ($novoStatus === 'pendente' && $mensalidade['data_vencimento'] < date('Y-m-d')) {
        $novoStatus = 'atrasado';
    }

    $conn->begin_transaction();
    try {
        $pagoEm = $novoStatus === 'pago' ? date('Y-m-d H:i:s') : null;
        $stmt = $conn->prepare('UPDATE mensalidade_membro SET status = ?, pago_em = ? WHERE id = ? AND clube_id = ?');
        $stmt->bind_param('ssii', $novoStatus, $pagoEm, $id, $clube_id);
        if (!$stmt->execute()) {
            throw new Exception('Erro ao atualizar mensalidade: ' . $stmt->error);
        }
        $stmt->close();

        if ($ajusteSaldo !== 0) {
            $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?');
            $stmtSaldo->bind_param('di', $ajusteSaldo, $clube_id);
            if (!$stmtSaldo->execute()) {
                throw new Exception('Erro ao atualizar caixa do clube: ' . $stmtSaldo->error);
            }
            $stmtSaldo->close();
        }

        $conn->commit();
        echo json_encode([
            'sucesso' => true,
            'status' => $novoStatus,
            'ajuste_saldo' => $ajusteSaldo,
            'saldo_atual' => obterSaldoAtual($conn, $clube_id),
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao atualizar status da mensalidade', 'detalhe' => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

http_response_code(400);
echo json_encode(['erro' => 'Ação inválida']);
$conn->close();
