<?php
function registrarHistorico($conn, $clube_id, $usuario_id, $acao, $entidade, $entidade_id = null, $descricao = '', $dados = null) {
    try {
        $stmt = $conn->prepare(
            'INSERT INTO historico_log (clube_id, usuario_id, acao, entidade, entidade_id, descricao, dados)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        $dadosJson = $dados === null ? null : json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $entidadeId = $entidade_id === null || $entidade_id === '' ? null : (int) $entidade_id;

        $stmt->bind_param('iississ', $clube_id, $usuario_id, $acao, $entidade, $entidadeId, $descricao, $dadosJson);
        $stmt->execute();
        $stmt->close();
    } catch (Throwable $e) {
        error_log('Erro ao registrar histórico: ' . $e->getMessage());
    }
}
