"""Genera los 3 PDF de muestra usados para probar la generacion de quizzes.

Uso: python generate_samples.py
Requiere: pip install reportlab
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

styles = getSampleStyleSheet()
title_style = ParagraphStyle("TitleEs", parent=styles["Title"], fontSize=18, spaceAfter=18)
h2 = ParagraphStyle("H2Es", parent=styles["Heading2"], spaceBefore=6, spaceAfter=8)
body = ParagraphStyle("BodyEs", parent=styles["Normal"], fontSize=11, leading=16, spaceAfter=10)


def build(filename, doc_title, pages):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
    )
    story = [Paragraph(doc_title, title_style), Spacer(1, 6)]
    for i, page in enumerate(pages):
        if i > 0:
            story.append(PageBreak())
        story.append(Paragraph(page["heading"], h2))
        for para in page["paragraphs"]:
            story.append(Paragraph(para, body))
    doc.build(story)
    print("generado:", filename)


# ---------------------------------------------------------------------------
# 1) Biologia: la celula y sus organelos
# ---------------------------------------------------------------------------
biologia = [
    {
        "heading": "1. Que es una celula",
        "paragraphs": [
            "La celula es la unidad basica de estructura y funcion de todo ser vivo. "
            "Existen dos tipos principales: las celulas procariotas, que no tienen nucleo "
            "definido y son propias de bacterias y arqueas, y las celulas eucariotas, que "
            "si tienen un nucleo delimitado por una membrana y son propias de animales, "
            "plantas, hongos y protistas.",
            "Toda celula esta rodeada por una membrana plasmatica, formada principalmente "
            "por una bicapa de fosfolipidos. Esta membrana controla que sustancias entran "
            "y salen de la celula mediante un proceso llamado transporte selectivo.",
            "El citoplasma es el medio interno de la celula, compuesto por citosol (un "
            "liquido gelatinoso) y los organelos que flotan en el. Todas las reacciones "
            "quimicas necesarias para mantener a la celula viva ocurren en el citoplasma "
            "o dentro de sus organelos.",
        ],
    },
    {
        "heading": "2. Organelos principales",
        "paragraphs": [
            "El nucleo es el organelo que contiene el material genetico (ADN) de la "
            "celula, organizado en cromosomas. Esta rodeado por la envoltura nuclear y "
            "controla casi todas las actividades celulares, incluida la division celular.",
            "La mitocondria es conocida como la central energetica de la celula: ahi "
            "ocurre la respiracion celular, un proceso que convierte la glucosa y el "
            "oxigeno en ATP, la molecula que la celula usa como energia. Las celulas con "
            "mayor demanda energetica, como las musculares, tienen muchas mas mitocondrias.",
            "Los ribosomas son estructuras pequenas, sin membrana, encargadas de fabricar "
            "proteinas a partir de las instrucciones que llegan del nucleo. Pueden estar "
            "libres en el citoplasma o adheridos al reticulo endoplasmatico rugoso.",
            "El reticulo endoplasmatico rugoso (con ribosomas adheridos) participa en la "
            "sintesis de proteinas, mientras que el reticulo endoplasmatico liso sintetiza "
            "lipidos y ayuda a eliminar sustancias toxicas. El aparato de Golgi recibe las "
            "proteinas del reticulo, las modifica, las empaqueta en vesiculas y las envia "
            "a su destino final dentro o fuera de la celula.",
        ],
    },
    {
        "heading": "3. Celula animal vs celula vegetal",
        "paragraphs": [
            "Las celulas vegetales tienen tres estructuras que las celulas animales no "
            "tienen: una pared celular rigida hecha de celulosa (por fuera de la membrana "
            "plasmatica, le da soporte estructural a la planta), una gran vacuola central "
            "que almacena agua y mantiene la presion de turgencia, y cloroplastos.",
            "Los cloroplastos son los organelos donde ocurre la fotosintesis: usan la luz "
            "solar para transformar dioxido de carbono y agua en glucosa y oxigeno. Por "
            "eso solo estan presentes en celulas vegetales y en algunas algas, nunca en "
            "celulas animales.",
            "En resumen, la respiracion celular (en la mitocondria) libera energia de la "
            "glucosa y ocurre en todas las celulas; la fotosintesis (en el cloroplasto) "
            "produce glucosa a partir de luz solar y solo ocurre en celulas vegetales.",
        ],
    },
]

# ---------------------------------------------------------------------------
# 2) Historia: la Revolucion Francesa
# ---------------------------------------------------------------------------
historia = [
    {
        "heading": "1. Causas de la Revolucion",
        "paragraphs": [
            "A fines del siglo XVIII, Francia atravesaba una grave crisis economica: las "
            "guerras costosas, entre ellas el apoyo financiero a la independencia de "
            "Estados Unidos, habian dejado al Estado casi en bancarrota, y las cosechas "
            "de 1788 fueron muy malas, lo que disparo el precio del pan.",
            "La sociedad francesa estaba dividida en tres estamentos: el clero (primer "
            "estamento), la nobleza (segundo estamento) y el resto de la poblacion, "
            "llamado el tercer estado, que pagaba casi todos los impuestos pero no tenia "
            "poder politico real pese a representar mas del 95% de los habitantes.",
            "Las ideas de la Ilustracion, con pensadores como Rousseau, Voltaire y "
            "Montesquieu, difundieron conceptos como la soberania popular, la division de "
            "poderes y la igualdad ante la ley, que chocaban directamente con el sistema "
            "absolutista del rey Luis XVI.",
        ],
    },
    {
        "heading": "2. Desarrollo de la Revolucion",
        "paragraphs": [
            "El 14 de julio de 1789 el pueblo de Paris tomo la prision de la Bastilla, "
            "simbolo del poder absoluto del rey. Esa fecha se considera el inicio formal "
            "de la Revolucion y hoy es el dia nacional de Francia.",
            "En agosto de 1789 la Asamblea Nacional aprobo la Declaracion de los Derechos "
            "del Hombre y del Ciudadano, que establecia la libertad, la igualdad y la "
            "propiedad como derechos naturales, y sentaria las bases del derecho "
            "constitucional moderno.",
            "El proceso se radicalizo con el paso de los anos: en 1792 se proclamo la "
            "Primera Republica Francesa, y el 21 de enero de 1793 el rey Luis XVI fue "
            "ejecutado en la guillotina, acusado de traicion. Le siguio un periodo "
            "conocido como el Terror (1793-1794), liderado por Maximilien Robespierre, "
            "durante el cual miles de personas consideradas enemigas de la revolucion "
            "fueron ejecutadas.",
        ],
    },
    {
        "heading": "3. Consecuencias",
        "paragraphs": [
            "La Revolucion Francesa termino con el Antiguo Regimen en Francia: elimino los "
            "privilegios de la nobleza y el clero, y estableció principios que luego se "
            "extendieron a buena parte del mundo occidental, como la soberania nacional y "
            "la igualdad legal entre ciudadanos.",
            "Tras anos de inestabilidad politica, el militar Napoleon Bonaparte dio un "
            "golpe de estado el 9 de noviembre de 1799 (conocido como el 18 de Brumario "
            "segun el calendario revolucionario), lo que puso fin al periodo "
            "revolucionario y abrio la etapa napoleonica.",
            "El legado de la Revolucion incluye el sistema metrico decimal, la idea de "
            "ciudadania moderna y una inspiracion directa para movimientos "
            "independentistas y revoluciones posteriores en America Latina y Europa.",
        ],
    },
]

# ---------------------------------------------------------------------------
# 3) Programacion: pilas y colas
# ---------------------------------------------------------------------------
programacion = [
    {
        "heading": "1. Pilas (Stack)",
        "paragraphs": [
            "Una pila es una estructura de datos lineal que sigue el principio LIFO "
            "(Last In, First Out): el ultimo elemento que se agrega es el primero en "
            "salir. Se puede imaginar como una pila de platos: solo se puede sacar o "
            "agregar un plato desde arriba.",
            "Las dos operaciones basicas de una pila son push, que agrega un elemento en "
            "el tope, y pop, que quita y devuelve el elemento del tope. Ambas operaciones "
            "tienen complejidad O(1), es decir, tiempo constante sin importar cuantos "
            "elementos tenga la pila.",
            "Un ejemplo tipico de uso es la funcion 'deshacer' (Ctrl+Z) de un editor de "
            "texto: cada accion se apila, y al deshacer se saca la ultima accion "
            "realizada. El historial de navegacion del boton 'atras' del navegador "
            "tambien funciona como una pila.",
        ],
    },
    {
        "heading": "2. Colas (Queue)",
        "paragraphs": [
            "Una cola es una estructura de datos lineal que sigue el principio FIFO "
            "(First In, First Out): el primer elemento que se agrega es el primero en "
            "salir, igual que una fila de personas esperando ser atendidas.",
            "Las dos operaciones basicas de una cola son enqueue, que agrega un elemento "
            "al final, y dequeue, que quita y devuelve el elemento del frente. Al igual "
            "que en la pila, ambas operaciones tienen complejidad O(1) cuando la cola "
            "esta bien implementada (por ejemplo, con una lista enlazada).",
            "Un ejemplo comun es la cola de impresion: el primer documento que se envia a "
            "imprimir es el primero en imprimirse. Los sistemas que procesan tareas en "
            "orden de llegada, como colas de atencion al cliente o colas de mensajes "
            "entre servicios, tambien usan este principio.",
        ],
    },
    {
        "heading": "3. Pilas vs colas: cuando usar cada una",
        "paragraphs": [
            "La diferencia clave esta en el orden de salida: LIFO en la pila (el ultimo "
            "en entrar es el primero en salir) contra FIFO en la cola (el primero en "
            "entrar es el primero en salir).",
            "Se usa una pila cuando el orden natural del problema es 'lo ultimo que "
            "paso se resuelve primero', como en la evaluacion de expresiones matematicas "
            "con parentesis o en la pila de llamadas de funciones de un programa "
            "(call stack).",
            "Se usa una cola cuando se necesita procesar las cosas en el mismo orden en "
            "que llegaron, como en la planificacion de tareas de un sistema operativo o "
            "en el recorrido por niveles (BFS) de un arbol o grafo.",
        ],
    },
]

build("biologia-celula.pdf", "Biologia: la celula y sus organelos", biologia)
build("historia-revolucion-francesa.pdf", "Historia: la Revolucion Francesa", historia)
build("programacion-pilas-colas.pdf", "Programacion: pilas y colas", programacion)
