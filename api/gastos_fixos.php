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
    "SELECT uc.status
     FROM usuario_clube uc
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

function garantirEstruturaGastosFixos(mysqli $conn): void
{
    if (!tabelaExiste($conn, 'gasto_fixo')) {
        $conn->query(
            "CREATE TABLE gasto_fixo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clube_id INT NOT NULL,
                nome VARCHAR(120) NOT NULL,
                valor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                dia_vencimento INT NOT NULL DEFAULT 10,
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                atualizado_em DATETIME NULL,
                INDEX idx_gasto_fixo_clube (clube_id),
                CONSTRAINT fk_gasto_fixo_clube FOREIGN KEY (clube_id) REFERENCES clube(id) ON DELETE CASCADE
            )"
        );
    }

    if (!tabelaExiste($conn, 'gasto_fixo_mes')) {
        $conn->query(
            "CREATE TABLE gasto_fixo_mes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clube_id INT NOT NULL,
                gasto_fixo_id INT NOT NULL,
                mes_referencia DATE NOT NULL,
                data_vencimento DATE NOT NULL,
                valor DECIMAL(10,2) NOT NULL,
                status ENUM('pendente','pago') NOT NULL DEFAULT 'pendente',
                pago_em DATETIME NULL,
                movimentacao_id INT NULL,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_gasto_fixo_mes (gasto_fixo_id, mes_referencia),
                INDEX idx_gasto_fixo_mes_clube (clube_id, mes_referencia, status),
                CONSTRAINT fk_gasto_fixo_mes_clube FOREIGN KEY (clube_id) REFERENCES clube(id) ON DELETE CASCADE,
                CONSTRAINT fk_gasto_fixo_mes_gasto FOREIGN KEY (gasto_fixo_id) REFERENCES gasto_fixo(id) ON DELETE CASCADE
            )"
        );
    }

    if (tabelaExiste($conn, 'gasto_fixo_mes') && !colunaExiste($conn, 'gasto_fixo_mes', 'movimentacao_id')) {
        $conn->query('ALTER TABLE gasto_fixo_mes ADD COLUMN movimentacao_id INT NULL AFTER pago_em');
    }
}

garantirEstruturaGastosFixos($conn);

function obterSaldoAtual(mysqli $conn, int $clube_id): float
{
    $stmt = $conn->prepare('SELECT saldo_atual FROM clube WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $clube_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? (float) $row['saldo_atual'] : 0.0;
}

function normalizarMes(?string $mes): string
{
    if ($mes && preg_match('/^\d{4}-\d{2}$/', $mes)) {
        return $mes . '-01';
    }
    return date('Y-m-01');
}

function dataVencimentoMes(string $mesReferencia, int $dia): string
{
    $dt = DateTime::createFromFormat('Y-m-d', $mesReferencia);
    $ultimoDia = (int) $dt->format('t');
    $diaAplicado = max(1, min($dia, $ultimoDia));
    return $dt->format('Y-m-') . str_pad((string) $diaAplicado, 2, '0', STR_PAD_LEFT);
}

function obterCategoriaSistema(mysqli $conn, int $clube_id, string $tipo, string $nome): int
{
    $stmt = $conn->prepare('SELECT id FROM categoria_movimentacao WHERE clube_id = ? AND tipo = ? AND nome = ? LIMIT 1');
    $stmt->bind_param('iss', $clube_id, $tipo, $nome);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        return (int) $row['id'];
    }

    $stmtInsert = $conn->prepare('INSERT INTO categoria_movimentacao (clube_id, nome, tipo) VALUES (?, ?, ?)');
    $stmtInsert->bind_param('iss', $clube_id, $nome, $tipo);
    if (!$stmtInsert->execute()) {
        throw new Exception('Erro ao criar categoria automática: ' . $stmtInsert->error);
    }
    $id = (int) $stmtInsert->insert_id;
    $stmtInsert->close();
    return $id;
}

function sincronizarGastosFixosDoMes(mysqli $conn, int $clube_id, string $mesReferencia): void
{
    $stmtGastos = $conn->prepare('SELECT id, valor, dia_vencimento FROM gasto_fixo WHERE clube_id = ? AND ativo = 1');
    $stmtGastos->bind_param('i', $clube_id);
    $stmtGastos->execute();
    $result = $stmtGastos->get_result();

    $stmtExiste = $conn->prepare('SELECT id FROM gasto_fixo_mes WHERE gasto_fixo_id = ? AND clube_id = ? AND mes_referencia = ? LIMIT 1');
    $stmtInsert = $conn->prepare(
        'INSERT INTO gasto_fixo_mes (clube_id, gasto_fixo_id, mes_referencia, data_vencimento, valor, status) VALUES (?, ?, ?, ?, ?, ?)' 
    );

    while ($gasto = $result->fetch_assoc()) {
        $gastoId = (int) $gasto['id'];
        $stmtExiste->bind_param('iis', $gastoId, $clube_id, $mesReferencia);
        $stmtExiste->execute();
        $existe = $stmtExiste->get_result()->fetch_assoc();

        if (!$existe) {
            $valor = (float) $gasto['valor'];
            $dataVencimento = dataVencimentoMes($mesReferencia, (int) $gasto['dia_vencimento']);
            $status = 'pendente';
            $stmtInsert->bind_param('iissds', $clube_id, $gastoId, $mesReferencia, $dataVencimento, $valor, $status);
            $stmtInsert->execute();
        }
    }

    $stmtGastos->close();
    $stmtExiste->close();
    $stmtInsert->close();
}

function carregarDados(mysqli $conn, int $clube_id, string $mesReferencia): array
{
    sincronizarGastosFixosDoMes($conn, $clube_id, $mesReferencia);

    $stmtGastos = $conn->prepare('SELECT id, nome, valor, dia_vencimento, ativo, criado_em FROM gasto_fixo WHERE clube_id = ? ORDER BY ativo DESC, nome ASC');
    $stmtGastos->bind_param('i', $clube_id);
    $stmtGastos->execute();
    $resultGastos = $stmtGastos->get_result();
    $gastos = [];
    while ($row = $resultGastos->fetch_assoc()) {
        $row['valor'] = (float) $row['valor'];
        $row['dia_vencimento'] = (int) $row['dia_vencimento'];
        $gastos[] = $row;
    }
    $stmtGastos->close();

    $stmtMes = $conn->prepare(
        "SELECT gfm.id, gfm.gasto_fixo_id, gfm.mes_referencia, gfm.data_vencimento, gfm.valor, gfm.status,
                gfm.pago_em, gfm.movimentacao_id, gf.nome, gf.dia_vencimento, gf.ativo
         FROM gasto_fixo_mes gfm
         INNER JOIN gasto_fixo gf ON gf.id = gfm.gasto_fixo_id
         WHERE gfm.clube_id = ? AND gfm.mes_referencia = ?
         ORDER BY gfm.status ASC, gfm.data_vencimento ASC, gf.nome ASC"
    );
    $stmtMes->bind_param('is', $clube_id, $mesReferencia);
    $stmtMes->execute();
    $resultMes = $stmtMes->get_result();
    $gastosMes = [];
    while ($row = $resultMes->fetch_assoc()) {
        $row['valor'] = (float) $row['valor'];
        $row['dia_vencimento'] = (int) $row['dia_vencimento'];
        $gastosMes[] = $row;
    }
    $stmtMes->close();

    return [
        'mes_referencia' => substr($mesReferencia, 0, 7),
        'gastos' => $gastos,
        'gastos_mes' => $gastosMes,
        'saldo_atual' => obterSaldoAtual($conn, $clube_id),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $mesReferencia = normalizarMes($_GET['mes'] ?? null);
    echo json_encode(carregarDados($conn, $clube_id, $mesReferencia));
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

$acao = trim($data['acao'] ?? '');

if ($acao === 'cadastrar') {
    $nome = trim($data['nome'] ?? '');
    $valor = (float) ($data['valor'] ?? 0);
    $diaVencimento = (int) ($data['dia_vencimento'] ?? 0);

    if ($nome === '' || $valor <= 0 || $diaVencimento < 1 || $diaVencimento > 31) {
        http_response_code(400);
        echo json_encode(['erro' => 'Preencha nome, valor maior que zero e dia de vencimento entre 1 e 31']);
        exit;
    }

    $stmt = $conn->prepare('INSERT INTO gasto_fixo (clube_id, nome, valor, dia_vencimento) VALUES (?, ?, ?, ?)');
    $stmt->bind_param('isdi', $clube_id, $nome, $valor, $diaVencimento);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao cadastrar gasto fixo', 'detalhe' => $stmt->error]);
        exit;
    }
    $novoId = (int) $stmt->insert_id;
    $stmt->close();

    sincronizarGastosFixosDoMes($conn, $clube_id, date('Y-m-01'));

    registrarHistorico($conn, $clube_id, $usuario_id, 'CRIAR', 'gasto_fixo', $novoId, "Gasto fixo cadastrado: {$nome}", [
        'nome' => $nome,
        'valor' => $valor,
        'dia_vencimento' => $diaVencimento,
    ]);

    echo json_encode(['sucesso' => true, 'id' => $novoId]);
    $conn->close();
    exit;
}

if ($acao === 'editar') {
    $id = (int) ($data['id'] ?? 0);
    $nome = trim($data['nome'] ?? '');
    $valor = (float) ($data['valor'] ?? 0);
    $diaVencimento = (int) ($data['dia_vencimento'] ?? 0);
    $ativo = isset($data['ativo']) ? (int) $data['ativo'] : 1;

    if ($id <= 0 || $nome === '' || $valor <= 0 || $diaVencimento < 1 || $diaVencimento > 31) {
        http_response_code(400);
        echo json_encode(['erro' => 'Dados inválidos para editar gasto fixo']);
        exit;
    }

    $stmtAtual = $conn->prepare('SELECT id, nome, valor, dia_vencimento, ativo FROM gasto_fixo WHERE id = ? AND clube_id = ? LIMIT 1');
    $stmtAtual->bind_param('ii', $id, $clube_id);
    $stmtAtual->execute();
    $anterior = $stmtAtual->get_result()->fetch_assoc();
    $stmtAtual->close();

    if (!$anterior) {
        http_response_code(404);
        echo json_encode(['erro' => 'Gasto fixo não encontrado']);
        exit;
    }

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare('UPDATE gasto_fixo SET nome = ?, valor = ?, dia_vencimento = ?, ativo = ?, atualizado_em = NOW() WHERE id = ? AND clube_id = ?');
        $stmt->bind_param('sdiiii', $nome, $valor, $diaVencimento, $ativo, $id, $clube_id);
        if (!$stmt->execute()) {
            throw new Exception('Erro ao atualizar gasto fixo: ' . $stmt->error);
        }
        $stmt->close();

        $mesAtual = date('Y-m-01');
        $novaDataVencimento = dataVencimentoMes($mesAtual, $diaVencimento);
        $stmtMes = $conn->prepare(
            "UPDATE gasto_fixo_mes
             SET valor = ?, data_vencimento = ?
             WHERE gasto_fixo_id = ? AND clube_id = ? AND mes_referencia >= ? AND status = 'pendente'"
        );
        $stmtMes->bind_param('dsiis', $valor, $novaDataVencimento, $id, $clube_id, $mesAtual);
        if (!$stmtMes->execute()) {
            throw new Exception('Erro ao atualizar parcelas pendentes: ' . $stmtMes->error);
        }
        $stmtMes->close();

        registrarHistorico($conn, $clube_id, $usuario_id, 'EDITAR', 'gasto_fixo', $id, "Gasto fixo editado: {$nome}", [
            'anterior' => $anterior,
            'novo' => [
                'nome' => $nome,
                'valor' => $valor,
                'dia_vencimento' => $diaVencimento,
                'ativo' => $ativo,
            ],
        ]);

        $conn->commit();
        echo json_encode(['sucesso' => true]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao editar gasto fixo', 'detalhe' => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

if ($acao === 'marcar_pago' || $acao === 'desmarcar_pago') {
    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['erro' => 'Gasto mensal inválido']);
        exit;
    }

    $stmtAtual = $conn->prepare(
        "SELECT gfm.id, gfm.valor, gfm.status, gfm.mes_referencia, gfm.data_vencimento, gf.nome
         FROM gasto_fixo_mes gfm
         INNER JOIN gasto_fixo gf ON gf.id = gfm.gasto_fixo_id
         WHERE gfm.id = ? AND gfm.clube_id = ?
         LIMIT 1"
    );
    $stmtAtual->bind_param('ii', $id, $clube_id);
    $stmtAtual->execute();
    $gastoMes = $stmtAtual->get_result()->fetch_assoc();
    $stmtAtual->close();

    if (!$gastoMes) {
        http_response_code(404);
        echo json_encode(['erro' => 'Gasto do mês não encontrado']);
        exit;
    }

    $valor = (float) $gastoMes['valor'];
    $nome = $gastoMes['nome'];
    $statusAnterior = $gastoMes['status'];

    if ($acao === 'marcar_pago' && $statusAnterior === 'pago') {
        echo json_encode(['sucesso' => true, 'mensagem' => 'Esse gasto já estava pago', 'saldo_atual' => obterSaldoAtual($conn, $clube_id)]);
        $conn->close();
        exit;
    }

    if ($acao === 'desmarcar_pago' && $statusAnterior !== 'pago') {
        echo json_encode(['sucesso' => true, 'mensagem' => 'Esse gasto já estava em aberto', 'saldo_atual' => obterSaldoAtual($conn, $clube_id)]);
        $conn->close();
        exit;
    }

    $conn->begin_transaction();
    try {
        if ($acao === 'marcar_pago') {
            $categoriaId = obterCategoriaSistema($conn, $clube_id, 'despesa', 'Gastos Fixos');
            $tipoMov = 'despesa';
            $descricaoMov = 'Pagamento de gasto fixo: ' . $nome;
            $novoStatus = 'pago';
            $pagoEm = date('Y-m-d H:i:s');
            $ajusteSaldo = -$valor;
            $acaoLog = 'PAGAR';
            $descricaoLog = "Gasto fixo pago: {$nome}";
        } else {
            $categoriaId = obterCategoriaSistema($conn, $clube_id, 'receita', 'Estorno de Gastos Fixos');
            $tipoMov = 'receita';
            $descricaoMov = 'Estorno de pagamento de gasto fixo: ' . $nome;
            $novoStatus = 'pendente';
            $pagoEm = null;
            $ajusteSaldo = $valor;
            $acaoLog = 'REABRIR';
            $descricaoLog = "Pagamento de gasto fixo desmarcado: {$nome}";
        }

        $dataMov = date('Y-m-d');
        $stmtMov = $conn->prepare(
            'INSERT INTO movimentacao (clube_id, evento_id, categoria_id, usuario_id, tipo, descricao, valor, data)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?)'
        );
        $stmtMov->bind_param('iiissds', $clube_id, $categoriaId, $usuario_id, $tipoMov, $descricaoMov, $valor, $dataMov);
        if (!$stmtMov->execute()) {
            throw new Exception('Erro ao registrar movimentação: ' . $stmtMov->error);
        }
        $movimentacaoId = (int) $stmtMov->insert_id;
        $stmtMov->close();

        $stmtSaldo = $conn->prepare('UPDATE clube SET saldo_atual = saldo_atual + ? WHERE id = ?');
        $stmtSaldo->bind_param('di', $ajusteSaldo, $clube_id);
        if (!$stmtSaldo->execute()) {
            throw new Exception('Erro ao atualizar caixa: ' . $stmtSaldo->error);
        }
        $stmtSaldo->close();

        $stmtStatus = $conn->prepare('UPDATE gasto_fixo_mes SET status = ?, pago_em = ?, movimentacao_id = ? WHERE id = ? AND clube_id = ?');
        $stmtStatus->bind_param('ssiii', $novoStatus, $pagoEm, $movimentacaoId, $id, $clube_id);
        if (!$stmtStatus->execute()) {
            throw new Exception('Erro ao atualizar status do gasto: ' . $stmtStatus->error);
        }
        $stmtStatus->close();

        registrarHistorico($conn, $clube_id, $usuario_id, $acaoLog, 'gasto_fixo_mes', $id, $descricaoLog, [
            'gasto' => $nome,
            'valor' => $valor,
            'status_anterior' => $statusAnterior,
            'status_novo' => $novoStatus,
            'mes_referencia' => $gastoMes['mes_referencia'],
            'movimentacao_id' => $movimentacaoId,
            'ajuste_saldo' => $ajusteSaldo,
        ]);

        $conn->commit();
        echo json_encode([
            'sucesso' => true,
            'status' => $novoStatus,
            'ajuste_saldo' => $ajusteSaldo,
            'saldo_atual' => obterSaldoAtual($conn, $clube_id),
            'movimentacao_id' => $movimentacaoId,
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['erro' => 'Erro ao alterar pagamento do gasto fixo', 'detalhe' => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

http_response_code(400);
echo json_encode(['erro' => 'Ação inválida']);
$conn->close();
