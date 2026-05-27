import { useEffect, useMemo, useState } from "react";
import {
  cadastrarGastoFixo,
  editarGastoFixo,
  listarGastosFixos,
  marcarGastoFixoPago,
  desmarcarGastoFixoPago,
} from "../services/api";

const formInicial = {
  nome: "",
  valor: "",
  dia_vencimento: "10",
  ativo: true,
};

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function formatarData(data) {
  if (!data) return "—";
  const [ano, mes, dia] = String(data).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return data;
  return `${dia}/${mes}/${ano}`;
}

function nomeMes(valor) {
  const data = new Date(`${valor || new Date().toISOString().slice(0, 7)}-01T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(data);
}

export default function GastosFixos({ onCaixaAtualizado, saldoAtual }) {
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState(formInicial);
  const [editandoId, setEditandoId] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [gastosMes, setGastosMes] = useState([]);

  const gastosPendentes = useMemo(
    () => gastosMes.filter((gasto) => gasto.status !== "pago"),
    [gastosMes]
  );

  const gastosPagos = useMemo(
    () => gastosMes.filter((gasto) => gasto.status === "pago"),
    [gastosMes]
  );

  const totalPendente = useMemo(
    () => gastosPendentes.reduce((acc, gasto) => acc + Number(gasto.valor || 0), 0),
    [gastosPendentes]
  );

  const totalPago = useMemo(
    () => gastosPagos.reduce((acc, gasto) => acc + Number(gasto.valor || 0), 0),
    [gastosPagos]
  );

  async function carregarDados() {
    setCarregando(true);
    try {
      const resposta = await listarGastosFixos(mes);
      setGastos(Array.isArray(resposta.gastos) ? resposta.gastos : []);
      setGastosMes(Array.isArray(resposta.gastos_mes) ? resposta.gastos_mes : []);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao carregar gastos fixos." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, [mes]);

  function handleChange(e) {
    const { id, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [id]: type === "checkbox" ? checked : value }));
  }

  function iniciarEdicao(gasto) {
    setEditandoId(gasto.id);
    setForm({
      nome: gasto.nome || "",
      valor: String(gasto.valor ?? ""),
      dia_vencimento: String(gasto.dia_vencimento ?? 10),
      ativo: gasto.ativo === 1 || gasto.ativo === true || gasto.ativo === "1",
    });
    setFeedback({ tipo: "", mensagem: "" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm(formInicial);
  }

  async function salvarGasto() {
    if (!form.nome.trim() || Number(form.valor) <= 0) {
      setFeedback({ tipo: "erro", mensagem: "⚠ Preencha o nome e um valor maior que zero." });
      return;
    }

    const dia = Number(form.dia_vencimento);
    if (dia < 1 || dia > 31) {
      setFeedback({ tipo: "erro", mensagem: "⚠ O dia de vencimento precisa ficar entre 1 e 31." });
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        valor: Number(form.valor),
        dia_vencimento: dia,
        ativo: form.ativo ? 1 : 0,
      };

      if (editandoId) {
        await editarGastoFixo({ id: editandoId, ...payload });
        setFeedback({ tipo: "sucesso", mensagem: "✔ Gasto fixo atualizado. Parcelas pendentes passam a usar o novo valor." });
      } else {
        await cadastrarGastoFixo(payload);
        setFeedback({ tipo: "sucesso", mensagem: "✔ Gasto fixo cadastrado e lançado no mês atual." });
      }

      setForm(formInicial);
      setEditandoId(null);
      await carregarDados();
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao salvar gasto fixo." });
    } finally {
      setSalvando(false);
    }
  }

  async function alterarPagamento(gastoMes, pago) {
    try {
      const resposta = pago
        ? await marcarGastoFixoPago(gastoMes.id)
        : await desmarcarGastoFixoPago(gastoMes.id);

      await carregarDados();
      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }

      const ajuste = Number(resposta.ajuste_saldo || 0);
      setFeedback({
        tipo: "sucesso",
        mensagem: pago
          ? `✔ Pagamento marcado. Caixa reduzido em ${formatarMoeda(Math.abs(ajuste))}.`
          : `✔ Pagamento desmarcado. Caixa recebeu estorno de ${formatarMoeda(Math.abs(ajuste))}.`,
      });
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao alterar pagamento." });
    }
  }

  function TabelaGastos({ titulo, itens, vazio, pago }) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>{titulo}</h3>
        </div>
        <div className="table-wrap">
          {carregando ? (
            <p style={{ padding: "1rem" }}>Carregando gastos...</p>
          ) : itens.length === 0 ? (
            <p style={{ padding: "1rem" }}>{vazio}</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Gasto</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pago em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((gasto) => (
                  <tr key={gasto.id}>
                    <td>
                      <strong>{gasto.nome}</strong>
                      <div className="table-subtext">Dia base: {gasto.dia_vencimento}</div>
                    </td>
                    <td>{formatarData(gasto.data_vencimento)}</td>
                    <td>{formatarMoeda(gasto.valor)}</td>
                    <td>{gasto.status === "pago" ? "Pago" : "Não pago"}</td>
                    <td>{formatarData(gasto.pago_em)}</td>
                    <td>
                      <div className="estoque-acoes">
                        {pago ? (
                          <button className="btn-cancelar" type="button" onClick={() => alterarPagamento(gasto, false)}>
                            Desmarcar como pago
                          </button>
                        ) : (
                          <button className="btn-confirmar" type="button" onClick={() => alterarPagamento(gasto, true)}>
                            Marcar como pago
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Gastos fixos mensais</h2>
        <span>Cadastre gastos recorrentes, gere o controle mensal automaticamente e movimente o caixa ao pagar ou reabrir.</span>
      </div>

      <div className="content-grid three-columns mensalidades-grid-top">
        <div className="card caixa-resumo-card compact">
          <div className="dashboard-card-content">
            <p>Caixa atual do clube</p>
            <strong className="caixa-resumo-valor">{formatarMoeda(saldoAtual)}</strong>
          </div>
        </div>
        <div className="card caixa-resumo-card compact">
          <div className="dashboard-card-content">
            <p>Total não pago em {nomeMes(mes)}</p>
            <strong className="caixa-resumo-valor">{formatarMoeda(totalPendente)}</strong>
            <span>{gastosPendentes.length} gasto(s) aberto(s)</span>
          </div>
        </div>
        <div className="card caixa-resumo-card compact">
          <div className="dashboard-card-content">
            <p>Total já pago em {nomeMes(mes)}</p>
            <strong className="caixa-resumo-valor">{formatarMoeda(totalPago)}</strong>
            <span>{gastosPagos.length} gasto(s) pago(s)</span>
          </div>
        </div>
      </div>

      {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

      <div className="content-grid two-columns mensalidades-grid-top">
        <div className="card">
          <div className="card-header">
            <h3>{editandoId ? "Editar gasto fixo" : "Novo gasto fixo"}</h3>
          </div>

          <div className="form-movimentacao">
            <div className="form-group">
              <label htmlFor="nome">Nome do gasto</label>
              <input id="nome" value={form.nome} onChange={handleChange} placeholder="Ex.: Aluguel, água, luz..." />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="valor">Valor mensal</label>
                <input id="valor" type="number" min="0" step="0.01" value={form.valor} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="dia_vencimento">Pagar até o dia</label>
                <input id="dia_vencimento" type="number" min="1" max="31" value={form.dia_vencimento} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <label>
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={handleChange} /> Gasto ativo
              </label>
            </div>

            <div className="mensalidade-info-box">
              Todo mês, ao abrir esta página, o sistema cria automaticamente a cobrança mensal dos gastos ativos.
            </div>

            <div className="form-actions">
              <button className="btn-confirmar" type="button" onClick={salvarGasto} disabled={salvando}>
                {salvando ? "Salvando..." : editandoId ? "Salvar edição" : "Cadastrar gasto fixo"}
              </button>
              {editandoId && (
                <button className="btn-cancelar" type="button" onClick={cancelarEdicao}>
                  Cancelar edição
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Gastos fixos cadastrados</h3>
          </div>
          <div className="table-wrap">
            {carregando ? (
              <p style={{ padding: "1rem" }}>Carregando cadastros...</p>
            ) : gastos.length === 0 ? (
              <p style={{ padding: "1rem" }}>Nenhum gasto fixo cadastrado.</p>
            ) : (
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Valor</th>
                    <th>Dia</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((gasto) => (
                    <tr key={gasto.id}>
                      <td>{gasto.nome}</td>
                      <td>{formatarMoeda(gasto.valor)}</td>
                      <td>{gasto.dia_vencimento}</td>
                      <td>{gasto.ativo === 1 || gasto.ativo === true || gasto.ativo === "1" ? "Ativo" : "Inativo"}</td>
                      <td>
                        <button className="btn-confirmar" type="button" onClick={() => iniciarEdicao(gasto)}>
                          Editar valor
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Mês de controle</h3>
        </div>
        <div className="form-movimentacao">
          <div className="form-group">
            <label htmlFor="mes">Listagem do mês</label>
            <input id="mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
        </div>
      </div>

      <TabelaGastos
        titulo={`Não pagos - ${nomeMes(mes)}`}
        itens={gastosPendentes}
        vazio="Nenhum gasto em aberto neste mês."
        pago={false}
      />

      <TabelaGastos
        titulo={`Pagos - ${nomeMes(mes)}`}
        itens={gastosPagos}
        vazio="Nenhum gasto pago neste mês."
        pago={true}
      />
    </div>
  );
}
