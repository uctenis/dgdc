const fs = require('fs');
const path = require('path');

const tsvData = `ALEJANDRO BARRIA	11662472	9	ALEJANDRO ALVARO BARRIA MATELUNA			abarriam@gmail.com
Abastec spa	76814443	5	COMERCIALIZADORA ABASTEC SPA			abastecspa@gmail.com
Amaris Constructora SpA	77648798	8	AMARIS CONSTRUCTORA			administracion@amaris.cl
Terra riegos	77094631	k	TERRA RIEGOS SPA			administracion@terrariegos.cl
Traiguen Energy S.A	76403114	8	TRAIGUEN ENERGY			administracion@traiguenergy.com
INSUR INGENIERIA SPA	77667513	K	INSUR INGENIERIA SPA			adquisiciones@insuringenieria.cl
Luis Eduardo Castro Sanhueza	9346688	8	LUIS EDUARDO CASTRO SANHUEZA			agroriegocastro@gmail.com
ALBAYRAK	76908161	5	ALBAYRAK SPA			albayrak.spa@gmail.com
AmbiQuim	76956078	5	AMBIQUIM SPA			ambiquim@vtr.net
BYM Logistics SPA	77223324	8	BYM LOGISTICS SPA			ana.lizama@bmlog.cl
Comercial flores ltda	76307697	0	COMERCIAL FLORES LIMITADA			arnold.steelltda@gmail.com
ACA Spa	77950451	4	ASESORÍAS CID ARRIAGADA SPA			asesoriascidarriagadaspa@gmail.com
Asistec	77192604	5	ASISTEC ARAUCANIA SPA			asistec.estufas@gmail.com
SOCIEDAD DE PROFESIONALES BAIXAS Y DEL RIO ARQUITECTOS LIMITADA	77712479	k	SOCIEDAD DE PROFESIONALES BAIXAS Y DEL RIO ARQUITECTOS LIMITADA			baixasdelrio@vtr.net
Botes temuco chile	77242835	9	COMERCIAL BOTES TEMUCO CHILE SPA			botestemucochile@gmail.com
Edipac	88566900	K	EDIPAC			cajatemuco@edipac.cmpc.cl
GILDA DE LOURDES MACHMAR MARTINEZ	8202873	0	PAQUETERIA GILDA			carlosrpalaciosm@hotmail.com
Carolin Klahn Paisajista	77976076	6	AREA VERDE LTDA			carolinklahn@gmail.com
CHC	79903920	6	CHC			cbello@chc.cl; shenriquez@chc.cl
CONSTRUCTORA IGECE LTDA	76878824	3	CONSTRUCTORA IGECE LIMITADA			cecilia.ulloa04@gmail.com
MUEBLES ADECOR Temuco	13115771	1	CLAUDIO ELIAS AROSTICA ORMENO			chileadecor@gmail.com
CORTINAJES CLAUDIO AGUILERA	11453172	3	CORTINAJES CLAUDIO AGUILERA			claudioeduardoaguilera@hotmail.com
Claudio triña, telecomunicaciones y obras menores e.i.r.l	77520606	3	CLAUDIO TRINA GARRIDO E.I.R.L.			claudiotrina08@gmail.com
Avantec	78209000	3	AVANTEC			clopez@avantec.cl
ARF Consultores	76969759	4	ARF CONSULTORES LTDA.			cmascui@arfarquitectura.cl
Schindler	93565000	3	ASCENSORES SCHINDLER (CHILE)			cobranza.cl@schindler.com
Materiales y servicios mar de cantabria spa	77305657	9	MATERIALES Y SERVICIOS MAR DE CANTABRIA SPA			colipe.gustavo@gmail.com
Constructora VITRO SPA	77631876		CONSTRUCTORA VITRO SPA			constructora.vitro@gmail.com
Invercon jbg	77119724	8	INVERCON JBG SPA			constructorajbg@gmail.com
Rukatami	76514788	3	CONSTRUCTORA RUKATAMI			CONSTRUCTORARUKATAMI@GMAIL.COM
TERRASUR	77780490	1	CONSTRUCTORA TERRASUR LIMITADA			constructoraterrasur@gmail.com
ESPACIO MUEBLES	77544225	5	ESPACIO MUEBLES LIMITADA			contacto.espaciomuebles@gmail.com
LECAR SPA.	77393585	8	LECAR SPA			contacto.lecar@gmail.com
CREASMILE	76308486	8	SERGIO MELO PUBLICIDAD E.I.R.L.			contacto@creasmile.cl
Girafa lift	77648625	6	SOCIEDAD DE ARRENDAMIENTO DE MAQUINARIAS GIRAFA LIFT LIMITADA			contacto@girafa.cl
GYG SPA	77215624	3	GYG SERVICIOS			contacto@gygtecnologias.com
POCK	77641694	0	POCK SPA			contacto@pock.cl
Steelpunk	76470291	3	STEELPUNK FITNESS OUTFITTERS			contacto@steelpunk.cl
Quincalleria cowe	5720722	1	QUINCALLERIA COWE			cowelimitada@gmail.com
Cristian Salamanca	13582386	4	CRISTIAN MARCELO SALAMANCA MEZA			csalamancameza@gmail.com
COMERCIALIZADORA DANIELA ARRIAGADA CABA EIRL	76707485	9	COMERCIALIZADORA DANIELA PATRICIA ARRIAGADA CABA			danielaarriagadacaba@hotmail.com
AGENCIA DSIETE LTDA	77964311	5	DSIETE SPA			dsiete.design@gmail.com
RAMASOL	76579595	8	RAMASOL			eoliva@ramasol.cl
88 LIMITADA	76108094	6	88 ARQUITECTOS LIMITADA			ernestina@88limitada.cl
FEMA	77092438	3	FABRICA DE MUEBLES Y CONTRUCCIONES FEMA SPA			femaproyectos@gmail.com
Quintana y Díaz Spa	76854883	8	VENTANAS H-D			finanzas@ventanashd.cl
VIVA CONSTRUCCIONES SPA	76971865	6	VIVA CONSTRUCCIONES SPA			finanzas@vivaconstrucciones.cl
Fmedios	8933359	8	FMEDIOS			fjmc_1@hotmail.com
Riol moisés bascur jara	11811450	7	FOSAS GOGOL			fosasgogol@hotmail.com
CONSTRUCTORA ROMO Y CADI LIMITADA	76107187	4	ROMO Y CADI LIMITADA			fromoc@gmail.com
Electropower	76257832	8	ELECTROPOWER			fsalvo@electropower.cl
Sic-Spa	77248719	3	SIC SPA			fuentes.roberto1@gmail.com
Ingeniería INGEG	77983113	2	INGENIERIA INGEG SPA			g.grandon@ingeg.cl
Globalmec ltda.	76862217	5	GLOBALMEC			globalmec.chile@gmail.com
Gaticar SPA	77578487	3	GATICAR SPA			hectorandres55@gmail.com
HOGUER	4305245	4	HOGUER			hoguer1@gmail.com
Dartel	96806110	0	DARTEL			hosses@dartel.cl
KÜME RUKA Spa.	77929977	5	KÜME RUKA SPA			hzambranoleal@gmail.com
Comercial Canada Blinds y Cia Ltda.	76271694	1	CORTINAS MSTUARD			ignacio@mstuard.cl; contactomstuard@gmail.com
Revolucion sport	77052801	1	REVOLUCION SPORT			ignaciomaciasu@hotmail.com; revolucionsportscl@gmail.com
Biometrika	76102607	0	BCR TECNOLOGIA E INNOVAVION S.A.			info@biometrika.cl
DUNATI SPA	76515462	6	DUNATI CHILE SPA			info@dunati.com
Super limitada	77224100	3	EXTINTORES SUPER			info@extintoressuper.cl; ventas@extintoressuper.cl
Pua	76962330	2	PUA DISEÑO			info@pua.cl
Ingenieria MC	77761115	1	INGENIERIA MC SPA			Ingenieriamcspa@gmail.com
Iprosam	76423859	1	IROSAM LTDA.			IPROSAM.FSD@GMAIL.COM
Jose Llancanao	77651423	3	SERVICIOS INTEGRALES EN EL AREA DE CONSTRUCCION E INSTALACIONES ELECTR			j.elect20@gmail.com
mK	77137860	9	MK			j.nunez@mk.cl
Eduardo Zelaya	9947799	2	ERASMO EDUARDO ZELAYA LOPEZ			jacqueline.rodriguez@hotmail.es
INDUMAC	83732700	8	INDUSTRIA METALURGICA ACONCAGUA LIMITADA			jbecker@indumac.cl
FORESTAL JORGE ARTURO CATALAN SANCHEZ E.I.R.L	76343261	0	FORESTAL JORGE ARTURO CATALÁN SÁNCHEZ E.I.R.L.			JCATALANSAN@GMAIL.COM
Corporativa Diseño	7739192	4	CORPORATIVA DISEÑO			jcpradenas@gmail.com
SERVIGEN SERVICIOS LIMITADA	76405567	5	SERVIGEN			jhidalgo@servigenchile.cl; rsantana@servigenchile.cl; lacuna@servigenchile.cl
OPCIONES	96523180	3	OPCIONES S.A.			jmunoz@opciones.cl
CONSTRUCCIONES JOSE LIENQUE E.I.R.L	76992766	2	CONSTRUCCIONES JOSE LIENQUEO E.I.R.L.			jose.lien.neico@gmail.com
ESPACIO CUBIERTO	76053604	0	ESPACIO CUBIERTO LIMITADA			JPCSORI@ESPACIOCUBIERTO.COM
EASTON	76028554	4	EASTON SPA			jvillarreal@easton.cl
CONSTRUCCIONES KORTANZ	76535548	6	CONSTRUCCIONES KORTANZ LIMITADA			kortanz71@gmail.com
OhOffice !	77570810	7	OHFFICE SPA			loreto.contreras@ohffice.cl
Sumo Arquitectura y Diseño Limitada	77652190	6	SUMO			lsmoro@sumo.cl
Ingenieria y construcciones Perinetti SPA	77489668	6	CONSTRUCTORA PERINETTI			lu.periavi@gmail.com
CONSTRUCCIONES LUIS EXEQUIEL SOLIS CATALAN E.I.R.L.	77280635	3	CONSTRUCCIONES LUIS EXEQUIEL SOLIS CATALAN E.I.R.L.			luis.exequielsolis@gmail.com
MR Electro Clima SPA	77773634	5	MR ELECTRO			luismanriquez555@gmail.com
LSA	76219281	0	LSA INGENIERIA Y CONSTRUCCIÓN E.I.R.L.			luissaez@lsaingenieria.cl
S2 lngenieria y Construcciones Ltda	76533924	3	S2 INGENIERIA Y CONSTRUCCIÓN LIMITADA			luissaez@lsaingenieria.cl
Sg 2000	78571480	6	SEMILLAS GENERACION 2000 S.A.			mabello@sg-2000.com; temuco@sg-2000.com
Ecoumwelt	9087185	4	ECOUMWELT			marcelojacobi@vtr.net
ELEKTRICA SPA	76884395	3	ELEKTRICA			marcopaine@elektrica.cl; marcopaine@gmail.com
Soc, Constructora Las Raíces Ltda.	76942931	k	SOCIEDAD CONSTRUCTORA LAS RAICES LTDA.			marioalejandrogm@gmail.com
Adco ltda.	76102612	7	COMERCIAL ADCO LIMITADA			mbravo@adcoltda.cl
360 GRADOS ING.	76395296	7	INGENIERIA Y CONSTRUCCIONES MARCELO SEBASTIAN CARO SOTO E.I.R.L.			mcarolina@gmail.com
CONSTRUCTORA Y SERVICIOS S-TEC SPA	77781356	0	CONSTRUCTORA Y SERVICIOS S-TEC SPA			miguelptorres@gmail.com
Innovaclima	76464159	0	INNOVACLIMA			mquezaday@gmail.com
Nueve DiseÑO	76181133	9	NUEVE DISEÑO			mubilla@gmail.com
Muebles MI CASA	3639408	0	MUEBLES MI CASA			muebleriamicasa@gmail.com
MULTIMUEBLES	6189318	0	MULTIMUEBLES			multimueblestemuco@gmail.com
Mundo sport	76458447	3	MUNDO SPORT TEMUCO			mundo.gonzalez@hotmail.com
ZUBIMED	77103330	k	ZUBIMED			mvega@zubimed.cl
ESTEC LTDA	79913160	9	ESTEC LTDA.			nfernandez@estec.cl
ROTULADOS DISEÑO Y PRODUCCION	9937535	3	ROTULADOS DISEÑO Y PRODUCCION			nicolas.rotulados@gmail.com
OCELEC	77102344	4	OCELEC. INGENIERÍA Y SERVICIOS SPA			ocelec.certificacion@gmail.com
Grúas Sánchez	76906671	3	GRUAS SANCHEZ SPA			oficina@gruassanchez.cl
TEC FULL	76265749	k	SOCIEDAD GONZALEZ GAJARDO Y COMPAÑIA LIMITADA			operaciones@tecfull.cl
Hernan orellana riffo eirl	76163902	1	ARIDOS TRANSPORTE Y ARRIENDO HERNAN ORELLANA RIFFO E.I.R.L.			orellanariffo@gmail.com
DECOIDEAS	77815707	1	DECOIDEAS			p.tapiamora07@gmail.com
Electrocom	96355000	6	ELECTROCOM Y MCT			PARREPOL@MCT.CL
Biessed	77710424	1	BLESSED SPA			patriciazoe7@gmail.com
Solar Free SPA	77037298	4	PROTECSOL			pbaezatroncoso@yahoo.com
Indura	76150343	K	INDURA			pedidocl@airproducts.com, arriendo@airproducts.com
Sonepar	96896480	1	SONEPAR CHILE			pedro.arevalo@sonepar.cl
Otis	96797340	8	OTIS			pedro.orellana@otis.com; tamara.salamanca@otis.com
Pedro melín schulz/cerrajero	10315691	2	PEDRO ALEJANDRO MELIN SCHULZ			pedromelin66@hotmail.com
Pernos san martín	78809340	3	PERNOS SAN MARTIN LIMITADA			pernos@sanmartin295.cl
Surazul Piscinas	8157955	5	RICARDO PINEDO BANDERAS			pinedo.ricardo@gmail.com
Rucantu SA	78089800	3	POLINCENTER			POLINCENTER@RUCANTU.CL
SOC. MUEBLES SANTA ANA LTDA	77624270	5	MUEBLES SANTA ANA			proyectos@mueblesmsa.cl
SUBTERRA INGENIERIA LIMITADA	76151785	6	SUBTERRA INGENIERIA LIMITADA			ptorrealba@subterra-ing.com
QWERSYS	77189607	3	QWERSYS COMPUTACION SPA			QWERSYS
Santa Sofia	76088711	0	CONSTRUCTORA SANTA SOFIA SPA			rbeltran@csantasofia.cl
Real Clima	77506311	4	REAL CLIMA			realclima22@hotmail.com
Labosel	76000746	3	LABOSEL			recepcion@labosel.cl
Trasve	96802280	6	TRANSVE S.A.			reparaciones@transve-servicios.cl; y.diaz@transve.cl
CES	73116100	3	INSTITUTO DE LA CONSTRUCCION			rluckeheide@iconstruccion.cl
ROBERTO LASSALLE	5503590	3	FLAVIA OYARZUN SOTO			roberto.lassalle@gmail.com
ECOSTANDAR	76244993	5	ECOSTANDARD SPA			rodrigo.vargas@ecostandard.cl
MORA Ingenieros	77345672	0	MORA INGENIEROS CONSULTORES SPA			rodrigo@moraing.cl
TRECAN SPA	78077589	0	TRECAN SPA			rodrigotrecanbeltran@gmail.com
Dap ducasse	76046809	6	DAP DUCASSE			ronald.matus@dapducasse.cl
Bip	78371600	3	BIP COMPUTER			rosses@bip.cl
Avanti	77790223	7	AVANTI LTDA			rrios.avanti@gmail.com
OPEN CHANNELS S.A	76035015	K	OPEN CHANNELS			rsedan@grupoconquistador.cl
Llaillayko Spa	78072333	5	LLAILLAYKO SPA			rukawe.llaillyko@gmail.com
Verde jardineria	76549451	6	VERDE JARDINERIA			sbedregalquintana@gmail.com
Celeste Producciones	76466847	2	CELESTE PRODUCCIONES			secretaria@celesteproducciones.cl
Sergio Flores	12928980	5	SERGIO ANIBAL FLORES GARRIDO			sergiofloresgarrido19731217@gmail.com
TECNOCAM SPA	76484316	9	TECNOCAM SPA			spa@tecnocam.cl; foliva@tecnocam.cl
Chilemaq	78554520	6	CHILEMAQ			temuco@chilemaq.cl
Decorene	76123668	7	DECORENE			temuco@decorene.cl
Gobantes	80409800	3	GOBANTES			temuco@gobantes.cl
Ingertemuco	77369471	0	INGERTEMUCO INGENIERIA SPA			tesoreriaingertemuco@gmail.com
Sodimac	96792430		SODIMAC S.A.			ve_temuco@sodimac.cl; osgonzaleza@sodimac.cl
La olleta limitada	76051775	5	MCO LA OLLETA			ventaempresa@mcoingenieria.cl
Aluminios 2000 spa	76057350	7	ALUMINIOS 2000			ventas@al2000.cl
Alcazar	78644350	4	COMERCIAL COYAHUE SPA			ventas@alcazar.cl
ALPLAS	77190049	6	CONSTRUCTORA ALPLAS SPA			ventas@alplas.cl
Comercial centra led spa	76837109	1	CENTRAL LED			ventas@centralled.cl
Espantando spa	76930196	8	ESPANTANDO			ventas@espantando.cl
Pesas Chile	76921044	k	PESAS CHILE			ventas@pesaschile.cl
Avalco spa	76173949	2	AVALCO SPA			ventas13@avalco.cl
Clima Lider	76216746	8	CLIMALIDER			ventastemuco@climalider.cl
THERMO VENTANAS SPA	77030305	2	THERMOALUM E.I.R.L.			ventasthermoalum@gmail.com
Timber Work	77679692	1	TIMBERWORK			yoiri.gutierrez@gmail.com
melman	96882140	7	MELMAN SPA			YVENEGAS@MELMAN.CL
CONSTRUCTORA INGETRAPP	78202133	8	CONSTRUCTORA INGETRAPP			
Paris 			CENCOSUD RETAIL S.A			
RyEGroupSpa	76684927	k	RyEGroupSpa			ventas@cardioprotegido.cl`;

function formatRutWithDots(numStr, dvStr) {
  if (!numStr) return '';
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return '';
  const formattedNum = new Intl.NumberFormat('es-CL').format(num);
  const dv = (dvStr || '').trim().toUpperCase();
  return dv ? `${formattedNum}-${dv}` : formattedNum;
}

const lines = tsvData.split('\n');
const parsedSuppliers = [];
const seenRuts = new Set();

lines.forEach((line, index) => {
  const parts = line.split('\t').map(p => p.trim());
  if (parts.length < 2) return;
  const nombreComercial = parts[0];
  const rutNum = parts[1];
  const dv = parts[2];
  const razonSocial = parts[3] || nombreComercial;
  const email = parts[parts.length - 1].includes('@') ? parts[parts.length - 1] : '';

  if (rutNum && !isNaN(parseInt(rutNum, 10))) {
    const fullRut = formatRutWithDots(rutNum, dv);
    if (!seenRuts.has(fullRut)) {
      seenRuts.add(fullRut);
      parsedSuppliers.push({
        id: 'prov-full-' + (index + 1),
        rut: fullRut,
        razonSocial: razonSocial || nombreComercial,
        nombreContacto: nombreComercial,
        email: email || 'contacto@' + (razonSocial || nombreComercial).toLowerCase().replace(/[^a-z0-9]/g, '') + '.cl',
        telefono: '+56 9 ' + String(90000000 + index * 1234).substring(0, 8),
        rubro: 'Obras Menores y Remodelaciones',
        cuentaSustentabilidad: true,
        direccion: 'Temuco',
        ciudad: 'Temuco',
        estado: 'Activo',
        fechaRegistro: '2026-01-01'
      });
    }
  }
});

fs.writeFileSync(path.join(__dirname, '../src/data/userSuppliers.json'), JSON.stringify(parsedSuppliers, null, 2));
console.log('Saved userSuppliers.json with', parsedSuppliers.length, 'unique suppliers');
