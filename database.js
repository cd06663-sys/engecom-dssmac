require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL         || '',
  process.env.SUPABASE_SERVICE_KEY || '',
  { auth: { persistSession: false } }
);

function sdkErr(e) {
  const err = new Error(e.message || 'Supabase error');
  err.code   = e.code;
  err.detail = e.details;
  return err;
}

async function sq(promise) {
  const { data, error } = await promise;
  if (error) throw sdkErr(error);
  return data ?? [];
}

async function initDB() {
  // Verifica conectividade — tabelas devem existir de inicialização anterior
  const { error } = await supabase.from('districts').select('id').limit(1);
  if (error) throw sdkErr(error);

  // Seed apenas se banco estiver vazio
  const { count } = await supabase.from('districts')
    .select('*', { count: 'exact', head: true });
  if (count > 0) return;

  const ins = async (table, row) =>
    (await sq(supabase.from(table).insert(row).select('id').single())).id;

  const pd = await ins('districts', { name: 'Parauapebas',       city: 'PARAUAPEBAS - PA' });
  const cd = await ins('districts', { name: 'Canaã dos Carajás', city: 'CANAÃ DOS CARAJÁS - PA' });
  const md = await ins('districts', { name: 'Marabá',            city: 'MARABÁ - PA' });

  const team = (name, district_id, team_number, instructor) =>
    ins('teams', { name, district_id, team_number, instructor: instructor || null });

  const pT1 = await team('Terraplanagem', pd, 1, 'RILDO MONTEIRO DA SILVA');
  const pT2 = await team('Prevenção',     pd, 2, 'RAIANE PEREIRA DA SILVA');
  await       team('Corretiva',     pd, 3, null);
  const cT1 = await team('Terraplanagem', cd, 1, 'PATRICK DE MENDONÇA GONÇALVES');
  const cT2 = await team('Corretiva',     cd, 2, 'DANIEL PEREIRA CAMPELO DA SILVA');
  const cT3 = await team('Prevenção',     cd, 3, 'MICHELY VIEIRA PEREIRA');
  await       team('Terraplanagem', md, 1, null);
  await       team('Corretiva',     md, 2, null);
  const mT3 = await team('Prevenção',     md, 3, 'DANIELA FERREIRA MORAES MATOS');

  const emp = async (list, team_id) => {
    for (const [matricula, name, fn] of list)
      await sq(supabase.from('employees')
        .insert({ matricula, name, function: fn, company: 'ENGECOM', team_id }));
  };

  await emp([
    ['19442','DIONIS LIMA DOS SANTOS','MOTORISTA OPERADOR'],
    ['19486','DOMINGOS DA SILVA','MOTORISTA OPERADOR'],
    ['19443','EDGALBES DA SILVA FERREIRA','SINALEIRO (A)'],
    ['19444','ELENILSON DOS SANTOS SILVA DE SOUSA','MOTORISTA OPERADOR'],
    ['19445','ELIS DOS SANTOS BEZERRA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19448','GILSON RAMOS DA COSTA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19449','GILVAN LIMA BRAGA','MOTORISTA OPERADOR'],
    ['19450','JACKSON FRANCISCO DOS SANTOS','ENCARREGADO II'],
    ['19458','JEFERSON MAGNO SILVA COSTA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19451','JOAO VITOR SANTOS DOS SANTOS','SINALEIRO (A)'],
    ['19430','JOSE RIBAMAR PEREIRA DOS SANTOS','OPERADOR DE MÁQUINAS PESADAS'],
    ['19418','RAIMUNDO NONATO DE CARVALHO LEITE FILHO','MOTORISTA OPERADOR'],
    ['19423','SALATIEL LUZ LEITE','OPERADOR DE MÁQUINAS PESADAS'],
  ], pT1);

  await emp([
    ['19424','ANTONIO AROLDO DA SILVA','PEDREIRO'],
    ['19425','ANTONIO DE JESUS SOUSA','OPERADOR DE MAQUINA LEVE'],
    ['19362','DANIEL SOUSA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19427','DENILSON BISPO DE ALMEIDA','PEDREIRO'],
    ['19428','DOMINGOS DA SILVA LOPO','OPERADOR DE MAQUINA LEVE'],
    ['19429','ERISON DEGLAN RODRIGUES DE OLIVEIRA','OPERADOR DE MAQUINA LEVE'],
    ['19456','FERNANDO DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19431','FRANCISCO JOSE DO NASCIMENTO BRIGIDO','OPERADOR DE MAQUINA LEVE'],
    ['19433','JOSIAS PESSOA CABRAL','OPERADOR DE MAQUINA LEVE'],
    ['19438','LEANDRO SOARES DIAS','ENCARREGADO II'],
    ['19461','MAURICIO SILVA LOPES','OPERADOR DE MAQUINA LEVE'],
    ['19437','ODAIR JOSE CAETANO MENDES','OPERADOR DE MAQUINA LEVE'],
    ['19439','RAIMUNDO JOSE MIRANDA DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
  ], pT2);

  await emp([
    ['19363','ALEXSANDRO BARBOSA LEAL','OPERADOR DE MÁQUINAS PESADAS'],
    ['19350','ANTONIO REGINALDO DA SILVA PEREIRA','SINALEIRO (A)'],
    ['19454','DAVIDSON NASCIMENTO DE SOUZA','MOTORISTA OPERADOR'],
    ['19323','EVALDO LIMA PAIVA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19325','FRANCISCO FERREIRA DA SILVA','ENCARREGADO II'],
    ['19465','GUSTAVO DE OLIVEIRA ABREU','OPERADOR DE MÁQUINAS PESADAS'],
    ['19457','JANSEN AQUINO DE SOUSA','MOTORISTA OPERADOR'],
    ['19361','JAQUELINE PEREIRA DOS SANTOS','SINALEIRO (A)'],
    ['19327','JOSE ALANO BATISTA SILVA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19349','MARCELO MOREIRA DOS SANTOS','OPERADOR DE MÁQUINAS PESADAS'],
    ['19461','MAURICIO DOS REIS DE OLIVEIRA','OPERADOR DE MÁQUINAS PESADAS'],
    ['19346','NILTON SANTANA DE MELO','MOTORISTA OPERADOR'],
    ['19347','WEVERTON NEYRON RIBEIRO','MOTORISTA OPERADOR'],
  ], cT1);

  await emp([
    ['19326','ALTEREDO SOUSA DA CRUZ','PEDREIRO'],
    ['19329','ARIEL MARTINS DA CRUZ','OPERADOR DE MAQUINA LEVE'],
    ['19330','DIONISIO DIAS PEREIRA FILHO','ENCARREGADO II'],
    ['19354','JOSE ANTONIO CARDOSO NASCIMENTO','PEDREIRO'],
    ['19331','JOSE MARCELO AQUINO PEREIRA','OPERADOR DE MAQUINA LEVE'],
    ['19348','JOSIMAR BATISTA DA SILVA','MOTORISTA OPERADOR'],
    ['19332','KAWAN KEVIS DA COSTA DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19333','SALIN JOSE PEREIRA DE SOUZA JUNIOR','OPERADOR DE MAQUINA LEVE'],
    ['19463','SAMUEL DOS SANTOS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19334','VANDERLEI AGUIAR GOES','OPERADOR DE MAQUINA LEVE'],
  ], cT2);

  await emp([
    ['19335','ANTONIO SOUSA DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19336','DARLYSON SOUSA DA CONCEIÇÃO','OPERADOR DE MAQUINA LEVE'],
    ['19355','GEOVANE TORRES PEREIRA','OPERADOR DE MAQUINA LEVE'],
    ['019364','JAMES SILVA SOUZA','OPERADOR DE MAQUINA LEVE'],
    ['19337','JERBISSON SOARES DURAS','OPERADOR DE MAQUINA LEVE'],
    ['19338','JOSIAS CAMARA E CAMARA','OPERADOR DE MAQUINA LEVE'],
    ['19339','KAICK BARBOSA DE JESUS','OPERADOR DE MAQUINA LEVE'],
    ['19340','RONEILLSON DE JESUS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19341','SAMUEL DOS REIS SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19342','THIAGO RODRIGUES DE MAGALHAES CORDEIRO','ENCARREGADO II'],
    ['19351','TONIELLY BARROSO RAMOS','MOTORISTA OPERADOR'],
    ['19343','WARLACE SANTOS DA SILVA','PEDREIRO'],
  ], cT3);

  await emp([
    ['19368','ANTONIO CARLOS DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19414','CARLOS ALBERTO SANTOS COSTA','MOTORISTA OPERADOR'],
    ['19372','CLEYDONIR RODRIGUES OLIVEIRA','PEDREIRO'],
    ['19375','DAVI ALVES SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19412','FELIPE GABRIEL MELO DOS SANTOS','OPERADOR DE MAQUINA LEVE'],
    ['19387','JANIO SOUSA E SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19388','JOÃO FERREIRA DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19393','JOSE DOMINGOS LOPES','ENCARREGADO II'],
    ['19396','MARCIO GLEI LIMA VIEIRA','OPERADOR DE MAQUINA LEVE'],
    ['19397','MARCOS DA SILVA SENA','OPERADOR DE MAQUINA LEVE'],
    ['19403','SAMUEL ARAUJO DA SILVA','OPERADOR DE MAQUINA LEVE'],
    ['19404','TARCIZO SILVA SOUZA','OPERADOR DE MAQUINA LEVE'],
    ['19392','BONI DO CERTO','PEDREIRO'],
  ], mT3);
}

module.exports = { supabase, sq, initDB };
