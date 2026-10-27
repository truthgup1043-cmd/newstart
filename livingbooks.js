// 살아있는 책 탭 — 목록은 subjects, 요약은 summaries (맨 뒤가 최신 요약, 기본 펼침)
const LIVINGBOOKS_DATA = {
  subjects: [
    {
      name: "성경·신앙",
      books: [
        { title: "My First Bible in Pictures", author: "Kenneth Taylor", note: "그림 성경, 만화체가 아닌 정중한 그림" },
        { title: "Prayer for a Child", author: "Rachel Field", note: "기도 그림책" },
        { title: "Trial and Triumph", author: "Richard Hannula", note: "교회사 이야기", later: true },
      ],
    },
    {
      name: "역사·전기",
      books: [
        { title: "Our Island Story", author: "H.E. Marshall", note: "이야기체 영국사" },
        { title: "Fifty Famous Stories Retold", author: "James Baldwin", note: "인물 중심 역사 이야기" },
        { title: "D'Aulaire 전기 시리즈", author: "Ingri & Edgar Parin D'Aulaire", note: "포카혼타스, 벤저민 프랭클린 등" },
        { title: "The Story of the World", author: "Susan Wise Bauer", note: "이야기체 세계사 입문" },
        { title: "조선 사람 표류기", author: "", note: "한국사 살아있는 책 (독서 지도 예시)" },
        { title: "안중근 의사 자서전·나의 생애와 사상", author: "안중근", note: "독서 지도 예시" },
      ],
    },
    {
      name: "자연·과학",
      books: [
        { title: "The Burgess Bird Book for Children", author: "Thornton W. Burgess", note: "새 이야기 과학" },
        { title: "Pagoo", author: "Holling Clancy Holling", note: "소라게 일생으로 배우는 해양 생물" },
        { title: "파브르 곤충기", author: "장 앙리 파브르", korean: true, note: "한국어판 있음" },
        { title: "Madam How and Lady Why", author: "Charles Kingsley", note: "지구 과학 이야기", later: true },
        { title: "The Life of the Spider", author: "Jean-Henri Fabre", note: "거미 일생", later: true },
      ],
    },
    {
      name: "지리",
      books: [
        { title: "Paddle-to-the-Sea", author: "Holling Clancy Holling", note: "나무 카누의 오대호 여정" },
        { title: "Around the World in Eighty Days", author: "Jules Verne", korean: true, note: "80일간의 세계일주, 한국어판 있음" },
      ],
    },
    {
      name: "문학·동화",
      books: [
        { title: "곰돌이 푸", author: "A.A. Milne", korean: true, note: "한국어판 있음" },
        { title: "피터 래빗 이야기", author: "Beatrix Potter", korean: true, note: "한국어판 있음" },
        { title: "이솝 우화", author: "", korean: true, note: "한국어판 있음" },
        { title: "피노키오", author: "Carlo Collodi", korean: true, note: "한국어판 있음" },
        { title: "피터팬", author: "J.M. Barrie", korean: true, note: "한국어판 있음" },
        { title: "샬롯의 거미줄", author: "E.B. White", korean: true, note: "한국어판 있음" },
        { title: "초원의 집", author: "Laura Ingalls Wilder", korean: true, note: "한국어판 있음" },
        { title: "하이디", author: "Johanna Spyri", korean: true, note: "한국어판 있음" },
        { title: "작은 아씨들", author: "Louisa May Alcott", korean: true, note: "한국어판 있음" },
        { title: "벨벳 토끼", author: "Margery Williams", korean: true, note: "한국어판 있음" },
        { title: "황금 강의 왕", author: "John Ruskin", note: "이야기체 동화" },
        { title: "Just-So Stories", author: "Rudyard Kipling", note: "동물 이야기, 요정 이야기류는 분별 노트 참고" },
        { title: "Red Fairy Book", author: "Andrew Lang", note: "요정 이야기, 분별 노트 참고" },
      ],
    },
    {
      name: "시·예술·음악",
      books: [
        { title: "A Child's Garden of Verses", author: "Robert Louis Stevenson", note: "하루 한 편씩 읽는 시" },
        { title: "Mother Goose", author: "", note: "영어 동요·전래 동요" },
        { title: "Lives of the Artists", author: "Giorgio Vasari", note: "예술가 이야기", later: true },
      ],
    },
  ],
  summaries: [
    {
      title: "파브르 곤충기",
      author: "장 앙리 파브르",
      meta: "한국어판 있음 · 원서 Souvenirs entomologiques",
      paragraphs: [
        "남프랑스 작은 마을 세리냥. 초라한 집 마당에서 30년 넘게 곤충을 들여다본 한 사람이 있었습니다. 장 앙리 파브르(1823-1915), 가난한 교사 출신의 곤충학자입니다. 그는 대학 실험실이 아니라 햇볕 내리쬐는 마당에서, 살아 있는 곤충을 눈앞에 두고 관찰하고 실험했습니다. 그 기록이 바로 『파브르 곤충기』입니다. 딱딱한 과학책이 아니라, 한 사람이 평생 사랑한 작은 생명들에 대한 이야기책입니다.",
        "파브르는 곤충을 표본으로 만들지 않았습니다. 살아 있는 채로, 그 자리에서, 몇 시간이고 지켜봤습니다. 그래서 이 책에는 도감에 없는 것이 들어 있습니다. 벌레의 습관, 선택, 실패, 그리고 그것을 바라보는 사람의 놀라움과 애정입니다. 한 저자의 열정이 그대로 전해지는, 메이슨이 말한 살아있는 책의 본보기입니다.",
        "매미는 땅속에서 4년을 삽니다. 어둠 속에서 네 번 껍질을 벗고, 다섯 번째 여름에야 땅 위로 올라와 울기 시작합니다. 파브르는 매미의 울음판이 어떻게 생겼는지 직접 들여다보고, 울음은 수컷만의 것이라는 사실까지 확인했습니다. 매미 한 마리의 울음 뒤에 4년의 기다림이 있다는 것을 알면, 여름 소리가 다르게 들립니다.",
        "쇠똥구리는 제 몸보다 큰 똥덩어리를 뒷다리로 굴려 제 집까지 가져갑니다. 파브르는 그 공 속에 알이 들어 있다는 것을 밝혀냈고, 쇠똥구리가 길을 잃지 않는지 별과 태양을 가려보는 실험까지 했습니다. 더러운 것으로 여겼던 똥덩어리가, 새 생명을 품은 요람이었다는 반전입니다.",
        "사마귀는 교미 뒤 수컷을 잡아먹습니다. 파브르는 이 잔인한 장면을 피하지 않고 그대로 적었습니다. 거미는 집을 짓고 먹이를 사냥하는 솜씨가 경이롭습니다. 이 책은 자연이 아름답기만 한 것이 아니라, 때로는 잔인하고 신비롭다는 것까지 솔직하게 보여줍니다.",
        "이 책은 처음부터 끝까지 읽을 필요가 없습니다. 한 편씩 소리 내어 읽고, 마당이나 공원에서 같은 곤충을 찾아보세요. 개미가 줄지어 가는 길, 나뭇잎 뒤의 애벌레를 보고 나면, 아이는 책 속 장면을 자기 눈으로 확인하게 됩니다. 읽은 뒤에는 자기 말로 이야기해 보게 하세요. 그것이 메이슨이 말한 이야기하기입니다.",
        "이 책을 읽고 나면 길가의 작은 벌레가 더 이상 그냥 벌레로 보이지 않습니다. 땅속 4년의 매미, 똥덩어리를 굴리는 쇠똥구리, 거미줄을 짜는 거미 — 그 작은 생명 하나하나에 이야기가 있다는 것을 알게 됩니다. 그래서 파브르 곤충기는 곤충 책이 아니라, 세상을 보는 눈을 바꿔주는 책입니다. 아이와 함께 첫 편을 펼쳐보세요. 아마 “다음 편도 읽어줘”라는 말을 듣게 될 겁니다.",
      ],
    },
  ],
};
