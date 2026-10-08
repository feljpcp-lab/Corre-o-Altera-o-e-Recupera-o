-- FELJ ERP development/initial seed
insert into public.maquinas(codigo,nome,setor,capacidade_hora,status) values
('SERRA-01','Serra 01','Serra',1,'disponivel'),('TORNO-01','Torno 01','Torno',1,'disponivel'),
('CTU-01','CTU 01','CTU',1,'disponivel'),('CTU-02','CTU 02','CTU',1,'disponivel'),
('FRESA-01','Fresadora 01','Fresadora',1,'disponivel'),('CTUC-01','CTU Calibração 01','CTU Calibração',1,'disponivel'),
('EFIO-01','Erosão a Fio 01','Erosão',1,'disponivel'),('EPEN-01','Erosão Penetração 01','Erosão',1,'disponivel')
on conflict(codigo) do nothing;

insert into public.motivos_parada(codigo,descricao,categoria) values
('MAN','Manutenção','Manutenção'),('FAL-MAT','Falta de material','Material'),('FAL-FER','Falta de ferramenta','Produção'),
('QUE','Quebra','Manutenção'),('AG-Q','Aguardando qualidade','Qualidade'),('AG-TER','Aguardando terceiro','Terceiros'),('OUT','Outro','Outros')
on conflict(codigo) do nothing;

insert into public.estoques(nome,localizacao) values
('Almoxarifado Aço','Aço H13'),('Quarentena','Qualidade'),('Remanescentes','Área de sobras')
on conflict(nome) do nothing;

insert into public.roteiros(nome,componente_tipo,versao) values
('Matriz padrão','Matriz',1),('Feeder padrão','Feeder',1),('Bolster padrão','Bolster',1),('Espina padrão','Espina',1)
on conflict(nome) do nothing;