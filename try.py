text = '***'
stars = ''
for char in text.lower():
    i = text.find(char)
    stars = stars + text[i]
    print(stars)
