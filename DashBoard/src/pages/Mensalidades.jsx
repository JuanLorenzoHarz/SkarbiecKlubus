import { useEffect, useMemo, useState } from "react";
import {
  atualizarStatusMensalidade,
  cadastrarMembroMensalidade,
  configurarMensalidadePadrao,
  listarMensalidades,
} from "../services/api";

const initialMembroForm = {
  nome: "",
  sobrenome: "",
  email: "",
  telefone: "",
  data_entrada: new Date().toISOString().slice(0, 10),
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

function formatarCompetencia(data) {
  if (!data) return "—";
  const dt = new Date(`${String(data).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "2-digit",
    year: "numeric",
  }).format(dt);
}

function nomeCompleto(membro) {
  return [membro.nome, membro.sobrenome].filter(Boolean).join(" ");
}

export default function Mensalidades({ onCaixaAtualizado, saldoAtual }) {
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvandoMembro, setSalvandoMembro] = useState(false);
  const [clube, setClube] = useState(null);
  const [membros, setMembros] = useState([]);
  const [mensalidades, setMensalidades] = useState([]);
  const [configValor, setConfigValor] = useState("");
  const [membroForm, setMembroForm] = useState(initialMembroForm);

  const mensalidadesRecentes = useMemo(() => mensalidades.slice(0, 40), [mensalidades]);
  const totalEmAberto = useMemo(
    () => membros.reduce((acc, membro) => acc + Number(membro.total_em_aberto || 0), 0),
    [membros]
  );
  const membrosInadimplentes = useMemo(
    () => membros.filter((membro) => Number(membro.mensalidades_em_aberto || 0) > 0).length,
    [membros]
  );

  async function carregarDados() {
    setCarregando(true);
    try {
      const resposta = await listarMensalidades();
      setClube(resposta.clube || null);
      setConfigValor(String(resposta.clube?.valor_mensalidade_padrao ?? ""));
      setMembros(Array.isArray(resposta.membros) ? resposta.membros : []);
      setMensalidades(Array.isArray(resposta.mensalidades) ? resposta.mensalidades : []);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao carregar mensalidades." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function handleMembroChange(e) {
    const { id, value, type, checked } = e.target;
    setMembroForm((prev) => ({ ...prev, [id]: type === "checkbox" ? checked : value }));
  }

  async function salvarConfiguracao() {
    const valor = Number(configValor || 0);
    if (valor < 0) {
      setFeedback({ tipo: "erro", mensagem: "⚠ Informe um valor de mensalidade válido." });
      return;
    }

    setSalvandoConfig(true);
    try {
      await configurarMensalidadePadrao({ valor_mensalidade_padrao: valor });
      await carregarDados();
      setFeedback({
        tipo: "sucesso",
        mensagem: "✔ Valor padrão salvo. As mensalidades passam a ser geradas automaticamente.",
      });
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao salvar configuração." });
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function cadastrarMembro() {
    if (!membroForm.nome.trim() || !membroForm.sobrenome.trim()) {
      setFeedback({ tipo: "erro", mensagem: "⚠ Preencha nome e sobrenome do membro." });
      return;
    }

    setSalvandoMembro(true);
    try {
      await cadastrarMembroMensalidade({
        nome: membroForm.nome.trim(),
        sobrenome: membroForm.sobrenome.trim(),
        email: membroForm.email.trim(),
        telefone: membroForm.telefone.trim(),
        data_entrada: membroForm.data_entrada,
        ativo: membroForm.ativo ? 1 : 0,
      });
      setMembroForm({ ...initialMembroForm, data_entrada: new Date().toISOString().slice(0, 10) });
      await carregarDados();
      setFeedback({
        tipo: "sucesso",
        mensagem: "✔ Membro cadastrado. As mensalidades dele foram calculadas automaticamente.",
      });
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao cadastrar membro." });
    } finally {
      setSalvandoMembro(false);
    }
  }

  async function alterarStatus(id, status) {
    try {
      const resposta = await atualizarStatusMensalidade({ id, status });
      await carregarDados();
      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }
      const ajuste = Number(resposta.ajuste_saldo || 0);
      setFeedback({
        tipo: "sucesso",
        mensagem:
          ajuste > 0
            ? `✔ Pagamento registrado. Caixa aumentado em ${formatarMoeda(ajuste)}.`
            : ajuste < 0
            ? `✔ Status alterado. Caixa reduzido em ${formatarMoeda(Math.abs(ajuste))}.`
            : "✔ Status atualizado com sucesso!",
      });
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao atualizar status." });
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Mensalidades</h2>
        <span>
          Controle automático por membro: entrada no clube, última mensalidade paga, parcelas em aberto e valor total a receber
        </span>
      </div>

      <div className="content-grid two-columns mensalidades-grid-top">
        <div className="card caixa-resumo-card compact">
          <div className="dashboard-card-content">
            <p>Caixa atual vinculado ao clube</p>
            <strong className="caixa-resumo-valor">{formatarMoeda(saldoAtual)}</strong>
          </div>
        </div>

        <div className="card caixa-resumo-card compact">
          <div className="dashboard-card-content">
            <p>Total em aberto de mensalidades</p>
            <strong className="caixa-resumo-valor">{formatarMoeda(totalEmAberto)}</strong>
            <span>{membrosInadimplentes} membro(s) com mensalidade em aberto</span>
          </div>
        </div>
      </div>

      {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

      <div className="content-grid two-columns mensalidades-grid-top">
        <div className="card">
          <div className="card-header">
            <h3>Configuração da mensalidade do clube</h3>
          </div>

          <div className="form-movimentacao">
            <div className="form-group">
              <label htmlFor="configValor">Valor padrão da mensalidade</label>
              <input
                id="configValor"
                type="number"
                min="0"
                step="0.01"
                value={configValor}
                onChange={(e) => setConfigValor(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button className="btn-confirmar" type="button" onClick={salvarConfiguracao} disabled={salvandoConfig}>
                {salvandoConfig ? "Salvando..." : "Salvar valor padrão"}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Novo membro</h3>
          </div>

          <div className="form-movimentacao">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nome">Nome</label>
                <input id="nome" value={membroForm.nome} onChange={handleMembroChange} />
              </div>
              <div className="form-group">
                <label htmlFor="sobrenome">Sobrenome</label>
                <input id="sobrenome" value={membroForm.sobrenome} onChange={handleMembroChange} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input id="email" value={membroForm.email} onChange={handleMembroChange} />
              </div>
              <div className="form-group">
                <label htmlFor="telefone">Telefone</label>
                <input id="telefone" value={membroForm.telefone} onChange={handleMembroChange} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="data_entrada">Data de entrada no clube</label>
                <input id="data_entrada" type="date" value={membroForm.data_entrada} onChange={handleMembroChange} />
              </div>
              <div className="form-group">
                <label>
                  <input type="checkbox" id="ativo" checked={membroForm.ativo} onChange={handleMembroChange} /> Membro ativo
                </label>
              </div>
            </div>

            <div className="mensalidade-info-box">
              A mensalidade passa a ser calculada automaticamente desde a data de entrada do membro.
            </div>

            <div className="form-actions">
              <button className="btn-confirmar" type="button" onClick={cadastrarMembro} disabled={salvandoMembro}>
                {salvandoMembro ? "Salvando..." : "Cadastrar membro"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Resumo automático dos membros</h3>
        </div>
        <div className="table-wrap">
          {carregando ? (
            <p style={{ padding: "1rem" }}>Carregando membros...</p>
          ) : membros.length === 0 ? (
            <p style={{ padding: "1rem" }}>Nenhum membro cadastrado.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Membro</th>
                  <th>Entrada</th>
                  <th>Última paga</th>
                  <th>Em aberto</th>
                  <th>Total devido</th>
                  <th>Próx. vencimento</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {membros.map((membro) => {
                  const aberto = Number(membro.mensalidades_em_aberto || 0);
                  return (
                    <tr key={membro.id}>
                      <td>
                        <strong>{nomeCompleto(membro)}</strong>
                        <div className="table-subtext">
                          {[membro.email, membro.telefone].filter(Boolean).join(" • ") || "Sem contato informado"}
                        </div>
                      </td>
                      <td>{formatarData(membro.data_entrada)}</td>
                      <td>{membro.ultima_mensalidade_paga ? formatarCompetencia(membro.ultima_mensalidade_paga) : "Nunca pagou"}</td>
                      <td>{aberto}</td>
                      <td>{formatarMoeda(membro.total_em_aberto)}</td>
                      <td>{membro.proximo_vencimento ? formatarData(membro.proximo_vencimento) : "Sem pendências"}</td>
                      <td>{membro.ativo === 1 || membro.ativo === true || membro.ativo === "1" ? (aberto > 0 ? "Ativo com pendência" : "Ativo em dia") : "Inativo"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Mensalidades automáticas geradas</h3>
        </div>
        <div className="table-wrap">
          {carregando ? (
            <p style={{ padding: "1rem" }}>Carregando mensalidades...</p>
          ) : mensalidades.length === 0 ? (
            <p style={{ padding: "1rem" }}>Nenhuma mensalidade encontrada.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Membro</th>
                  <th>Competência</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pago em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {mensalidadesRecentes.map((mensalidade) => (
                  <tr key={mensalidade.id}>
                    <td>{[mensalidade.nome, mensalidade.sobrenome].filter(Boolean).join(" ")}</td>
                    <td>{formatarCompetencia(mensalidade.mes_referencia)}</td>
                    <td>{formatarData(mensalidade.data_vencimento)}</td>
                    <td>{formatarMoeda(mensalidade.valor)}</td>
                    <td>{mensalidade.status}</td>
                    <td>{formatarData(mensalidade.pago_em)}</td>
                    <td>
                      <div className="estoque-acoes">
                        <button className="btn-confirmar" type="button" onClick={() => alterarStatus(mensalidade.id, "pago")}>
                          Pago
                        </button>
                        <button className="btn-cancelar" type="button" onClick={() => alterarStatus(mensalidade.id, "pendente")}>
                          Reabrir
                        </button>
                        <button className="btn-cancelar" type="button" onClick={() => alterarStatus(mensalidade.id, "isento")}>
                          Isento
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
