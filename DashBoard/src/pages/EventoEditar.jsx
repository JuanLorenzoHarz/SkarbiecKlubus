import { useEffect, useState } from "react";
import { criarProdutoEvento, detalharEvento, finalizarEvento, movimentarProdutoEvento } from "../services/api";

const initialForm = { nome: "", descricao: "", preco_original: "", preco_venda: "", quantidade_estoque: "" };

function moeda(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}

function normalizar(p) {
  return {
    ...p,
    id: Number(p.id),
    preco_original: Number(p.preco_original),
    preco_venda: Number(p.preco_venda),
    quantidade_estoque: Number(p.quantidade_estoque),
    ativo: p.ativo === true || p.ativo === 1 || p.ativo === "1",
  };
}

export default function EventoEditar({ eventoId, onBack, onOpenReport, onCaixaAtualizado }) {
  const [evento, setEvento] = useState(null);
  const [clubes, setClubes] = useState([]);
  const [produtosFixos, setProdutosFixos] = useState([]);
  const [produtosEvento, setProdutosEvento] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [quantidades, setQuantidades] = useState({});
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    try {
      const data = await detalharEvento(eventoId);
      setEvento(data.evento || null);
      setClubes(data.clubes || []);
      setProdutosFixos((data.produtos_fixos || []).map(normalizar));
      setProdutosEvento((data.produtos_evento || []).map(normalizar));
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao carregar evento." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [eventoId]);

  function handleForm(e) {
    const { id, value } = e.target;
    setForm((p) => ({ ...p, [id]: value }));
  }

  function setQtd(chave, value) {
    setQuantidades((p) => ({ ...p, [chave]: Math.max(1, Number(value || 1)) }));
  }

  async function cadastrarProdutoEvento() {
    if (!form.nome.trim() || Number(form.preco_original) <= 0 || Number(form.preco_venda) <= 0 || Number(form.quantidade_estoque) < 0) {
      setFeedback({ tipo: "erro", mensagem: "Preencha corretamente os dados do produto do evento." });
      return;
    }

    setEnviando(true);
    try {
      const data = await criarProdutoEvento({ evento_id: eventoId, ...form });
      setFeedback({ tipo: "sucesso", mensagem: `Produto do evento cadastrado. Caixa reduzido em ${moeda(data.custo_inicial || 0)}.` });
      setForm(initialForm);
      await carregar();
      if (onCaixaAtualizado) await onCaixaAtualizado();
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao cadastrar produto do evento." });
    } finally {
      setEnviando(false);
    }
  }

  async function movimentar(produto, origem, tipo) {
    const chave = `${origem}-${produto.id}`;
    const quantidade = quantidades[chave] || 1;
    try {
      const data = await movimentarProdutoEvento({ evento_id: eventoId, produto_id: produto.id, origem, tipo, quantidade });
      setFeedback({
        tipo: "sucesso",
        mensagem: tipo === "saida" ? `Venda registrada. Caixa aumentado em ${moeda(data.valor_movimento || 0)}.` : `Compra registrada. Caixa reduzido em ${moeda(data.valor_movimento || 0)}.`,
      });
      await carregar();
      if (onCaixaAtualizado) await onCaixaAtualizado();
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao movimentar produto." });
    }
  }

  async function finalizar() {
    const ok = window.confirm("Finalizar este evento para todos os clubes? Depois disso ele ficará fechado e o gerenciamento será bloqueado.");
    if (!ok) return;
    try {
      await finalizarEvento(eventoId);
      setFeedback({ tipo: "sucesso", mensagem: "Evento finalizado para todos os clubes." });
      await carregar();
      onOpenReport(eventoId);
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao finalizar evento." });
    }
  }

  function TabelaProdutos({ titulo, produtos, origem }) {
    return (
      <div className="card">
        <div className="card-header"><h3>{titulo}</h3></div>
        <div className="table-wrap">
          {produtos.length === 0 ? <p style={{ padding: "1rem" }}>Nenhum produto nessa lista.</p> : (
            <table className="simple-table">
              <thead><tr><th>Produto</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Ações</th></tr></thead>
              <tbody>
                {produtos.map((p) => {
                  const chave = `${origem}-${p.id}`;
                  return (
                    <tr key={chave}>
                      <td>{p.nome}</td><td>{moeda(p.preco_original)}</td><td>{moeda(p.preco_venda)}</td><td>{p.quantidade_estoque}</td>
                      <td>
                        <div className="estoque-acoes">
                          <input type="number" min="1" value={quantidades[chave] || 1} onChange={(e) => setQtd(chave, e.target.value)} />
                          <button className="btn-cancelar" onClick={() => movimentar(p, origem, "entrada")}>Comprar +</button>
                          <button className="btn-confirmar" onClick={() => movimentar(p, origem, "saida")}>Vender</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (carregando) return <div className="secao ativa"><p>Carregando evento...</p></div>;

  return (
    <div className="secao ativa">
      <div className="page-title-row">
        <div><h2>Gerenciamento do evento</h2><span>{evento?.nome} • {clubes.map((c) => c.nome).join(", ")}</span></div>
        <div className="estoque-acoes"><button className="btn-cancelar" onClick={onBack}>Voltar</button><button className="btn-cancelar" onClick={() => onOpenReport(eventoId)}>Relatório</button></div>
      </div>

      {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

      {Number(evento?.ativo) !== 1 && <div className="feedback erro">Este evento está fechado. Use a página de relatório.</div>}

      <div className="card">
        <div className="card-header"><h3>Cadastrar produto específico do evento</h3></div>
        <div className="form-movimentacao">
          <div className="form-group"><label>Nome</label><input id="nome" value={form.nome} onChange={handleForm} disabled={Number(evento?.ativo) !== 1} /></div>
          <div className="form-group"><label>Descrição</label><textarea id="descricao" value={form.descricao} onChange={handleForm} disabled={Number(evento?.ativo) !== 1} /></div>
          <div className="form-row">
            <div className="form-group"><label>Custo unitário</label><input type="number" id="preco_original" value={form.preco_original} onChange={handleForm} disabled={Number(evento?.ativo) !== 1} /></div>
            <div className="form-group"><label>Preço de venda</label><input type="number" id="preco_venda" value={form.preco_venda} onChange={handleForm} disabled={Number(evento?.ativo) !== 1} /></div>
          </div>
          <div className="form-group"><label>Quantidade inicial</label><input type="number" id="quantidade_estoque" value={form.quantidade_estoque} onChange={handleForm} disabled={Number(evento?.ativo) !== 1} /></div>
          <div>Custo inicial: <strong>{moeda(Number(form.preco_original || 0) * Number(form.quantidade_estoque || 0))}</strong></div>
          <div className="form-actions"><button className="btn-confirmar" onClick={cadastrarProdutoEvento} disabled={enviando || Number(evento?.ativo) !== 1}>Cadastrar produto</button></div>
        </div>
      </div>

      <TabelaProdutos titulo="Produtos fixos do clube vendidos no evento" produtos={produtosFixos} origem="fixo" />
      <TabelaProdutos titulo="Produtos específicos deste evento" produtos={produtosEvento} origem="evento" />

      <div className="form-actions"><button className="btn-confirmar danger" onClick={finalizar} disabled={Number(evento?.ativo) !== 1}>Finalizar evento para todos</button></div>
    </div>
  );
}
