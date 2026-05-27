function formatarMoeda(valor = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function temPermissao(permissoes, permissao) {
  if (!permissao) return true;
  const lista = Array.isArray(permissao) ? permissao : [permissao];
  return lista.some((chave) => Boolean(permissoes?.[chave]));
}

export default function Dashboard({ onNavigate, saldoAtual, clube, permissoes = {} }) {
  const cards = [
    {
      titulo: "Movimentações",
      descricao: "Registre entradas e saídas do clube em um único lugar.",
      acao: "Abrir movimentações",
      destino: "movimentacoes",
      permissao: "perm_ver_movimentacoes",
    },
    {
      titulo: "Categorias",
      descricao: "Crie categorias de receita e despesa vinculadas ao clube atual.",
      acao: "Abrir categorias",
      destino: "categorias",
      permissao: ["perm_editar_movimentacoes", "perm_gerenciar_cargos"],
    },
    {
      titulo: "Cargos",
      descricao: "Cadastre cargos e defina as permissões disponíveis na tesouraria.",
      acao: "Abrir cargos",
      destino: "cargos",
      permissao: "perm_gerenciar_cargos",
    },
    {
      titulo: "Usuários",
      descricao: "Vincule novos usuários ao clube e organize permissões de acesso.",
      acao: "Abrir usuários",
      destino: "usuarios",
      permissao: "perm_aprovar_membros",
    },
    {
      titulo: "Produtos",
      descricao: "Cadastre produtos e acompanhe a movimentação do estoque do clube.",
      acao: "Abrir produtos",
      destino: "produtos",
      permissao: "perm_ver_produtos",
    },
    {
      titulo: "Mensalidades",
      descricao: "Configure o valor mensal do clube, cadastre membros e controle cobranças.",
      acao: "Abrir mensalidades",
      destino: "mensalidades",
      permissao: "perm_ver_mensalidades",
    },
    {
      titulo: "Histórico",
      descricao: "Consulte o registro de logs das ações feitas no clube.",
      acao: "Abrir histórico",
      destino: "historico",
      permissao: "perm_ver_relatorios",
    },
  ].filter((card) => temPermissao(permissoes, card.permissao));

  return (
    <div className="secao ativa">
      <div>
        <h2>Dashboard</h2>
        <span>Visão geral do sistema financeiro</span>
      </div>

      <div className="card caixa-resumo-card">
        <div className="card-header">
          <h3>Caixa atual do clube</h3>
        </div>
        <div className="dashboard-card-content">
          <strong className="caixa-resumo-valor">{formatarMoeda(saldoAtual)}</strong>
          <p>
            {clube?.nome
              ? `Saldo consolidado do clube ${clube.nome}.`
              : "Saldo consolidado do clube autenticado."}
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        {cards.map((card) => (
          <div key={card.titulo} className="card dashboard-card">
            <div className="card-header">
              <h3>{card.titulo}</h3>
            </div>

            <div className="dashboard-card-content">
              <p>{card.descricao}</p>
              <button
                className="btn-confirmar"
                type="button"
                onClick={() => onNavigate(card.destino)}
              >
                {card.acao}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
