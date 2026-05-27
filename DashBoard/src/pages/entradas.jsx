import { useState } from "react";
import { registrarMovimentacao } from "../services/api";

const initialForm = {
  data: "",
  valor: "",
  categoria_id: "",
  descricao: "",
  observacoes: "",
};

export default function Entradas() {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });

  function handleChange(e) {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  }

  async function confirmarMovimentacao() {
    const { data, valor, categoria_id, descricao, observacoes } = form;

    if (!data || !valor || !categoria_id || !descricao) {
      setFeedback({
        tipo: "erro",
        mensagem: "⚠ Preencha todos os campos obrigatórios.",
      });
      return;
    }

    try {
      const resposta = await registrarMovimentacao({
        tipo: "receita",
        data,
        valor: Number(valor),
        categoria_id: Number(categoria_id),
        descricao,
        observacoes,
      });

      if (resposta.erro) {
        setFeedback({ tipo: "erro", mensagem: resposta.erro });
        return;
      }

      setFeedback({ tipo: "sucesso", mensagem: "✔ Entrada registrada com sucesso!" });
      setForm(initialForm);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: "Erro ao conectar com o servidor." });
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Entradas</h2>
        <span>Cadastre receitas do clube</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Nova Entrada</h3>
        </div>

        <div className="form-movimentacao">
          {feedback.mensagem && (
            <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="data">Data</label>
              <input id="data" type="date" value={form.data} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label htmlFor="valor">Valor</label>
              <input id="valor" type="number" value={form.valor} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="categoria_id">Categoria</label>
            <select id="categoria_id" value={form.categoria_id} onChange={handleChange}>
              <option value="">Selecione...</option>
              <option value="1">Mensalidade</option>
              <option value="2">Patrocínio</option>
              <option value="5">Outro</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="descricao">Descrição</label>
            <input id="descricao" value={form.descricao} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="observacoes">Observações</label>
            <textarea id="observacoes" value={form.observacoes} onChange={handleChange} />
          </div>

          <div className="form-actions">
            <button className="btn-confirmar" type="button" onClick={confirmarMovimentacao}>
              Confirmar entrada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
