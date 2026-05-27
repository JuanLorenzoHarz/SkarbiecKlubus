import { useEffect, useState } from "react";
import { listarCategorias, registrarMovimentacao } from "../services/api";

const initialForm = {
  tipo: "",
  data: "",
  valor: "",
  categoria_id: "",
  descricao: "",
  observacoes: "",
};

function formatarMoeda(valor = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

export default function Receitas({ onCaixaAtualizado, saldoAtual }) {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [enviando, setEnviando] = useState(false);
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    async function carregarCategorias() {
      try {
        const res = await listarCategorias();
        setCategorias(res.categorias || []);
      } catch (error) {
        console.error("Erro ao carregar categorias:", error);
      }
    }

    carregarCategorias();
  }, []);

  const categoriasFiltradas = categorias.filter((c) => c.tipo === form.tipo);

  function handleChange(e) {
    const { id, value } = e.target;

    setForm((prev) => {
      if (id === "tipo") {
        return {
          ...prev,
          tipo: value,
          categoria_id: "",
        };
      }

      return {
        ...prev,
        [id]: value,
      };
    });
  }

  function limparFormulario() {
    setForm(initialForm);
    setFeedback({ tipo: "", mensagem: "" });
  }

  async function confirmarMovimentacao() {
    const { tipo, data, valor, categoria_id, descricao, observacoes } = form;

    if (!tipo || !data || !valor || !categoria_id || !descricao) {
      setFeedback({
        tipo: "erro",
        mensagem: "⚠ Preencha todos os campos obrigatórios.",
      });
      return;
    }

    setEnviando(true);

    try {
      const resposta = await registrarMovimentacao({
        tipo,
        data,
        valor: Number(String(valor).replace(",", ".")),
        categoria_id: Number(categoria_id),
        descricao,
        observacoes,
      });

      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }

      setFeedback({
        tipo: "sucesso",
        mensagem: `✔ Movimentação registrada com sucesso! Caixa atualizado para ${formatarMoeda(
          resposta.saldo_atual
        )}.`,
      });

      setForm(initialForm);
    } catch (error) {
      setFeedback({
        tipo: "erro",
        mensagem: error.message || "Erro ao registrar movimentação.",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Movimentações</h2>
        <span>Registre receitas e despesas</span>
      </div>

      <div className="card caixa-resumo-card compact">
        <div className="dashboard-card-content">
          <p>Caixa atual vinculado ao clube</p>
          <strong className="caixa-resumo-valor">{formatarMoeda(saldoAtual)}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Nova Movimentação</h3>
        </div>

        <div className="form-movimentacao">
          {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" value={form.tipo} onChange={handleChange}>
                <option value="">Selecione...</option>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="data">Data</label>
              <input type="date" id="data" value={form.data} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="valor">Valor</label>
              <input type="number" id="valor" value={form.valor} onChange={handleChange} step="0.01" min="0.01" />
            </div>

            <div className="form-group">
              <label htmlFor="categoria_id">Categoria</label>
              <select id="categoria_id" value={form.categoria_id} onChange={handleChange} disabled={!form.tipo}>
                <option value="">Selecione...</option>
                {categoriasFiltradas.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="descricao">Descrição</label>
            <input id="descricao" value={form.descricao} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="observacoes">
              Observações <span className="opcional">(opcional)</span>
            </label>
            <textarea id="observacoes" value={form.observacoes} onChange={handleChange} />
          </div>

          <div className="form-actions">
            <button type="button" onClick={limparFormulario} className="btn-cancelar">
              Limpar
            </button>

            <button type="button" onClick={confirmarMovimentacao} disabled={enviando} className="btn-confirmar">
              {enviando ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
