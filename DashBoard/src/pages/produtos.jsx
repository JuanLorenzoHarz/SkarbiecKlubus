import { useEffect, useMemo, useState } from "react";
import { criarProduto, editarProduto, listarProdutos, movimentarProduto } from "../services/api";

const initialForm = {
  nome: "",
  descricao: "",
  preco_original: "",
  preco_venda: "",
  quantidade_estoque: "",
  ativo: true,
};

function normalizarProduto(p) {
  return {
    ...p,
    id: Number(p.id),
    preco_original: Number(p.preco_original),
    preco_venda: Number(p.preco_venda),
    quantidade_estoque: Number(p.quantidade_estoque),
    ativo: p.ativo === true || p.ativo === 1 || p.ativo === "1",
  };
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

export default function Produtos({ onCaixaAtualizado, saldoAtual }) {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [enviando, setEnviando] = useState(false);
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [quantidades, setQuantidades] = useState({});
  const [produtoEditandoId, setProdutoEditandoId] = useState(null);
  const [editForm, setEditForm] = useState(initialForm);

  const produtoEditando = useMemo(
    () => produtos.find((produto) => produto.id === produtoEditandoId) || null,
    [produtos, produtoEditandoId]
  );

  function handleChange(e) {
    const { id, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [id]: type === "checkbox" ? checked : value,
    }));
  }

  function handleEditChange(e) {
    const { id, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [id]: type === "checkbox" ? checked : value,
    }));
  }

  function handleQuantidadeChange(id, value) {
    const quantidade = Math.max(1, Number(value || 1));
    setQuantidades((prev) => ({
      ...prev,
      [id]: quantidade,
    }));
  }

  function limparFormulario() {
    setForm(initialForm);
    setFeedback({ tipo: "", mensagem: "" });
  }

  function abrirEdicao(produto) {
    setProdutoEditandoId(produto.id);
    setEditForm({
      nome: produto.nome || "",
      descricao: produto.descricao || "",
      preco_original: String(produto.preco_original ?? ""),
      preco_venda: String(produto.preco_venda ?? ""),
      quantidade_estoque: String(produto.quantidade_estoque ?? ""),
      ativo: Boolean(produto.ativo),
    });
    setFeedback({ tipo: "", mensagem: "" });
  }

  function cancelarEdicao() {
    setProdutoEditandoId(null);
    setEditForm(initialForm);
  }

  async function carregarProdutos() {
    try {
      const data = await listarProdutos();
      setProdutos((data.produtos || []).map(normalizarProduto));
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao carregar produtos." });
    } finally {
      setCarregando(false);
    }
  }

  async function cadastrarProduto() {
    const { nome, preco_original, preco_venda, quantidade_estoque } = form;

    if (!nome || !preco_original || !preco_venda || quantidade_estoque === "") {
      setFeedback({
        tipo: "erro",
        mensagem: "⚠ Preencha os campos obrigatórios.",
      });
      return;
    }

    const precoOriginal = Number(preco_original);
    const precoVenda = Number(preco_venda);
    const qtd = Number(quantidade_estoque);

    if (precoOriginal <= 0 || precoVenda <= 0 || qtd < 0) {
      setFeedback({
        tipo: "erro",
        mensagem: "⚠ Informe valores válidos para preço e estoque.",
      });
      return;
    }

    setEnviando(true);

    try {
      const data = await criarProduto({
        nome: form.nome.trim(),
        descricao: form.descricao,
        preco_original: precoOriginal,
        preco_venda: precoVenda,
        quantidade_estoque: qtd,
        ativo: form.ativo ? 1 : 0,
      });

      const novoProduto = normalizarProduto(data.produto);
      setProdutos((prev) => [novoProduto, ...prev]);
      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }
      setFeedback({
        tipo: "sucesso",
        mensagem: `✔ Produto cadastrado com sucesso! Caixa ajustado em ${formatarMoeda(data.custo_inicial || 0)}.`,
      });
      setForm(initialForm);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao cadastrar produto." });
    } finally {
      setEnviando(false);
    }
  }

  async function salvarEdicao() {
    if (!produtoEditandoId) return;

    const precoOriginal = Number(editForm.preco_original);
    const precoVenda = Number(editForm.preco_venda);
    const qtd = Number(editForm.quantidade_estoque);

    if (!editForm.nome || precoOriginal <= 0 || precoVenda <= 0 || qtd < 0) {
      setFeedback({
        tipo: "erro",
        mensagem: "⚠ Preencha corretamente os dados do produto para salvar a edição.",
      });
      return;
    }

    setEnviando(true);

    try {
      const data = await editarProduto({
        id: produtoEditandoId,
        nome: editForm.nome.trim(),
        descricao: editForm.descricao,
        preco_original: precoOriginal,
        preco_venda: precoVenda,
        quantidade_estoque: qtd,
        ativo: editForm.ativo ? 1 : 0,
      });

      const produtoAtualizado = normalizarProduto(data.produto);
      setProdutos((prev) => prev.map((p) => (p.id === produtoEditandoId ? produtoAtualizado : p)));
      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }

      const ajuste = Number(data.ajuste_caixa || 0);
      const mensagemAjuste =
        ajuste === 0
          ? "Sem alteração no caixa."
          : ajuste > 0
          ? `Caixa aumentado em ${formatarMoeda(ajuste)}.`
          : `Caixa reduzido em ${formatarMoeda(Math.abs(ajuste))}.`;

      setFeedback({
        tipo: "sucesso",
        mensagem: `✔ Produto atualizado com sucesso! ${mensagemAjuste}`,
      });
      cancelarEdicao();
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao editar produto." });
    } finally {
      setEnviando(false);
    }
  }

  async function movimentarEstoque(id, tipo, quantidade = 1) {
    try {
      const data = await movimentarProduto({ id, tipo, quantidade });

      setProdutos((prev) =>
        prev.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                ...normalizarProduto(data.produto || p),
              }
        )
      );

      if (typeof onCaixaAtualizado === "function") {
        await onCaixaAtualizado();
      }

      setFeedback({
        tipo: "sucesso",
        mensagem:
          tipo === "entrada"
            ? `✔ Estoque aumentado com sucesso! Caixa reduzido em ${formatarMoeda(data.valor_movimento || 0)}.`
            : `✔ Venda registrada com sucesso! Caixa aumentado em ${formatarMoeda(data.valor_movimento || 0)}.`,
      });
    } catch (err) {
      console.error(err);
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao conectar com o servidor." });
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  return (
    <div className="secao ativa">
      <div>
        <h2>Produtos</h2>
        <span>Cadastro de produtos, custos, preços de venda e movimentação de estoque integrada ao caixa</span>
      </div>

      <div className="card caixa-resumo-card compact">
        <div className="dashboard-card-content">
          <p>Caixa atual vinculado ao clube</p>
          <strong className="caixa-resumo-valor">{formatarMoeda(saldoAtual)}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Novo Produto</h3>
        </div>

        <div className="form-movimentacao">
          {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

          <div className="form-group">
            <label htmlFor="nome">
              Nome <span style={{ color: "red" }}>*</span>
            </label>
            <input id="nome" value={form.nome} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="descricao">Descrição</label>
            <textarea id="descricao" value={form.descricao} onChange={handleChange} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="preco_original">
                Valor original / custo unitário <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="number"
                id="preco_original"
                min="0.01"
                step="0.01"
                value={form.preco_original}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="preco_venda">
                Preço de venda <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="number"
                id="preco_venda"
                min="0.01"
                step="0.01"
                value={form.preco_venda}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="quantidade_estoque">
              Quantidade em estoque <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="number"
              id="quantidade_estoque"
              min="0"
              step="1"
              value={form.quantidade_estoque}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>
              <input type="checkbox" id="ativo" checked={form.ativo} onChange={handleChange} /> Produto ativo
            </label>
          </div>

          <div style={{ marginTop: "-0.5rem", fontSize: "0.92rem", color: "#555" }}>
            Custo inicial estimado: <strong>{formatarMoeda(Number(form.preco_original || 0) * Number(form.quantidade_estoque || 0))}</strong>
          </div>

          <div className="form-actions">
            <button className="btn-cancelar" onClick={limparFormulario} type="button">
              Limpar
            </button>
            <button className="btn-confirmar" onClick={cadastrarProduto} disabled={enviando} type="button">
              {enviando ? "Salvando..." : "Registrar produto"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Produtos cadastrados</h3>
        </div>

        <div className="table-wrap">
          {carregando ? (
            <p style={{ padding: "1rem" }}>Carregando produtos...</p>
          ) : produtos.length === 0 ? (
            <p style={{ padding: "1rem" }}>Nenhum produto cadastrado.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Preço de Custo</th>
                  <th>Preço de Venda</th>
                  <th>Estoque</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{formatarMoeda(p.preco_original)}</td>
                    <td>{formatarMoeda(p.preco_venda)}</td>
                    <td>{p.quantidade_estoque}</td>
                    <td>{p.ativo ? "Ativo" : "Inativo"}</td>
                    <td>
                      <div className="estoque-acoes" style={{ flexWrap: "wrap" }}>
                        <input
                          type="number"
                          min="1"
                          value={quantidades[p.id] || 1}
                          onChange={(e) => handleQuantidadeChange(p.id, e.target.value)}
                        />

                        <button
                          type="button"
                          className="btn-cancelar"
                          onClick={() => movimentarEstoque(p.id, "entrada", quantidades[p.id] || 1)}
                        >
                          + Estoque
                        </button>

                        <button
                          type="button"
                          className="btn-confirmar"
                          onClick={() => movimentarEstoque(p.id, "saida", quantidades[p.id] || 1)}
                        >
                          - Vender
                        </button>

                        <button type="button" className="btn-cancelar" onClick={() => abrirEdicao(p)}>
                          Editar produto
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

      {produtoEditando && (
        <div className="card">
          <div className="card-header">
            <h3>Editando: {produtoEditando.nome}</h3>
          </div>

          <div className="form-movimentacao">
            <div className="form-group">
              <label htmlFor="nome">Nome</label>
              <input id="nome" value={editForm.nome} onChange={handleEditChange} />
            </div>

            <div className="form-group">
              <label htmlFor="descricao">Descrição</label>
              <textarea id="descricao" value={editForm.descricao} onChange={handleEditChange} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="preco_original">Valor original / custo unitário</label>
                <input
                  type="number"
                  id="preco_original"
                  min="0.01"
                  step="0.01"
                  value={editForm.preco_original}
                  onChange={handleEditChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="preco_venda">Preço de venda</label>
                <input
                  type="number"
                  id="preco_venda"
                  min="0.01"
                  step="0.01"
                  value={editForm.preco_venda}
                  onChange={handleEditChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="quantidade_estoque">Quantidade em estoque</label>
              <input
                type="number"
                id="quantidade_estoque"
                min="0"
                step="1"
                value={editForm.quantidade_estoque}
                onChange={handleEditChange}
              />
            </div>

            <div className="form-group">
              <label>
                <input type="checkbox" id="ativo" checked={editForm.ativo} onChange={handleEditChange} /> Produto ativo
              </label>
            </div>

            <div style={{ marginTop: "-0.5rem", fontSize: "0.92rem", color: "#555" }}>
              {Number(editForm.quantidade_estoque || 0) === Number(produtoEditando.quantidade_estoque || 0)
                ? "A edição dos valores não altera o caixa enquanto a quantidade permanecer igual."
                : `Ajuste previsto no caixa: ${
                    Number(editForm.quantidade_estoque || 0) > Number(produtoEditando.quantidade_estoque || 0)
                      ? `saída de ${formatarMoeda(
                          (Number(editForm.quantidade_estoque || 0) - Number(produtoEditando.quantidade_estoque || 0)) *
                            Number(editForm.preco_original || 0)
                        )}`
                      : `entrada de ${formatarMoeda(
                          (Number(produtoEditando.quantidade_estoque || 0) - Number(editForm.quantidade_estoque || 0)) *
                            Number(editForm.preco_original || 0)
                        )}`
                  }`}
            </div>

            <div className="form-actions">
              <button className="btn-cancelar" type="button" onClick={cancelarEdicao}>
                Cancelar
              </button>
              <button className="btn-confirmar" type="button" onClick={salvarEdicao} disabled={enviando}>
                {enviando ? "Salvando..." : "Salvar edição"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
